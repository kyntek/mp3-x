"""HTTP API + static UI. Run with `uv run mp3-x`."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import threading
import webbrowser
from contextlib import asynccontextmanager
from importlib.metadata import version
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from . import formats
from .config import DATA_DIR, settings
from .db import db
from .downloader import ACTIVE, manager, probe

UI_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_: FastAPI):
	manager.start(asyncio.get_running_loop())
	yield


app = FastAPI(title="mp3-x", lifespan=lifespan)


def _item_or_404(item_id: int) -> dict[str, Any]:
	item = db.get(item_id)
	if not item:
		raise HTTPException(404, "Not found")
	return item


# ---- lookup & queue ------------------------------------------------------------------------------

class ProbeIn(BaseModel):
	url: str
	playlist: bool = False


@app.post("/api/probe")
async def api_probe(body: ProbeIn):
	url = body.url.strip()
	if not url.startswith(("http://", "https://")):
		url = "https://" + url
	try:
		return await run_in_threadpool(probe, url, body.playlist)
	except Exception as e:
		msg = str(e).replace("ERROR: ", "")
		raise HTTPException(422, msg.split("\n")[0][:300]) from e


class Entry(BaseModel):
	url: str
	id: str | None = None
	title: str | None = None
	uploader: str | None = None
	duration: float | None = None
	thumbnail: str | None = None
	source: str | None = None


class EnqueueIn(BaseModel):
	entries: list[Entry]
	format: str
	quality: str | None = None
	smart_tags: bool | None = None
	playlist: str | None = None


@app.post("/api/downloads")
def api_enqueue(body: EnqueueIn):
	if not body.entries:
		raise HTTPException(400, "Nothing to download")
	try:
		formats.kind_of(body.format)
	except ValueError as e:
		raise HTTPException(400, str(e)) from e
	smart = settings.get("smart_tags") if body.smart_tags is None else body.smart_tags
	ids = manager.enqueue([e.model_dump() for e in body.entries], body.format, body.quality, smart, body.playlist)
	return {"ids": ids}


@app.get("/api/items")
def api_items():
	return [manager.serialize(i) for i in db.list()]


@app.post("/api/items/{item_id}/cancel")
def api_cancel(item_id: int):
	_item_or_404(item_id)
	manager.cancel(item_id)
	return {"ok": True}


@app.post("/api/items/{item_id}/retry")
def api_retry(item_id: int):
	_item_or_404(item_id)
	manager.retry(item_id)
	return {"ok": True}


@app.delete("/api/items/{item_id}")
def api_delete(item_id: int, delete_file: bool = False):
	_item_or_404(item_id)
	try:
		manager.remove(item_id, delete_file)
	except OSError as e:
		raise HTTPException(409, f"Could not delete the file: {e}") from e
	return {"ok": True}


class ClearIn(BaseModel):
	which: str  # finished | failed


@app.post("/api/items/clear")
def api_clear(body: ClearIn):
	statuses = {"failed": ("error", "canceled")}.get(body.which)
	if not statuses:
		raise HTTPException(400, "Unknown list")
	manager.clear(statuses)
	return {"ok": True}


@app.post("/api/items/cancel-all")
def api_cancel_all():
	for item in db.list(ACTIVE):
		manager.cancel(item["id"])
	return {"ok": True}


# ---- files ---------------------------------------------------------------------------------------

@app.get("/api/items/{item_id}/thumb")
def api_thumb(item_id: int):
	item = _item_or_404(item_id)
	if not item.get("thumb_file") or not os.path.exists(item["thumb_file"]):
		raise HTTPException(404)
	return FileResponse(item["thumb_file"], headers={"Cache-Control": "max-age=86400"})


@app.get("/api/items/{item_id}/file")
def api_file(item_id: int):
	item = _item_or_404(item_id)
	path = item.get("file_path")
	if not path or not os.path.exists(path):
		raise HTTPException(404, "File is missing")
	return FileResponse(path)


def _open(path: str, reveal: bool) -> None:
	if sys.platform == "win32":
		if reveal:
			subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
		else:
			os.startfile(path)  # type: ignore[attr-defined]
	elif sys.platform == "darwin":
		subprocess.Popen(["open", "-R", path] if reveal else ["open", path])
	else:
		subprocess.Popen(["xdg-open", os.path.dirname(path) if reveal else path])


@app.post("/api/items/{item_id}/open")
def api_open(item_id: int, reveal: bool = False):
	item = _item_or_404(item_id)
	path = item.get("file_path")
	if not path or not os.path.exists(path):
		raise HTTPException(404, "File is missing")
	_open(path, reveal)
	return {"ok": True}


class FolderIn(BaseModel):
	which: str  # audio | video


@app.post("/api/open-folder")
def api_open_folder(body: FolderIn):
	folder = settings.get("audio_dir" if body.which == "audio" else "video_dir")
	Path(folder).mkdir(parents=True, exist_ok=True)
	_open(folder, False)
	return {"ok": True}


# ---- events --------------------------------------------------------------------------------------

@app.get("/api/events")
async def api_events():
	q = manager.subscribe()

	async def stream():
		try:
			yield "retry: 2000\n\n"
			while True:
				try:
					event = await asyncio.wait_for(q.get(), timeout=15)
					yield f"data: {json.dumps(event)}\n\n"
				except TimeoutError:
					yield ": ping\n\n"
		finally:
			manager.unsubscribe(q)

	return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# ---- settings & system ---------------------------------------------------------------------------

@app.get("/api/settings")
def api_settings():
	return settings.all()


@app.put("/api/settings")
def api_settings_put(values: dict[str, Any]):
	if values.get("cookies_file") and not os.path.isfile(values["cookies_file"]):
		raise HTTPException(400, "Cookies file not found")
	updated = settings.update(values)
	manager.wake()
	return updated


PICKER = r"""
import sys, tkinter as tk
from tkinter import filedialog
root = tk.Tk(); root.withdraw(); root.attributes("-topmost", True)
if sys.argv[1] == "file":
    p = filedialog.askopenfilename(initialdir=sys.argv[2] or None, filetypes=[("Cookies", "*.txt"), ("All files", "*.*")])
else:
    p = filedialog.askdirectory(initialdir=sys.argv[2] or None, mustexist=False)
print(p or "", end="")
"""


class PickIn(BaseModel):
	kind: str = "folder"
	initial: str = ""


@app.post("/api/pick")
def api_pick(body: PickIn):
	"""Native folder/file dialog, run in its own process so Tk owns its main thread."""
	try:
		out = subprocess.run(
			[sys.executable, "-c", PICKER, body.kind, body.initial],
			capture_output=True, text=True, timeout=600,
		)
	except (OSError, subprocess.TimeoutExpired) as e:
		raise HTTPException(500, f"Could not open a picker: {e}") from e
	return {"path": os.path.normpath(out.stdout) if out.stdout else None}


@app.get("/api/system")
def api_system():
	ffmpeg_dir = settings.ffmpeg()
	ffmpeg_version = None
	if ffmpeg_dir:
		exe = shutil.which("ffmpeg", path=ffmpeg_dir)
		if exe:
			try:
				first = subprocess.run([exe, "-version"], capture_output=True, text=True, timeout=10).stdout.split("\n")[0]
				ffmpeg_version = first.split(" ")[2] if first.startswith("ffmpeg version") else first
			except (OSError, subprocess.TimeoutExpired):
				pass
	return {
		"yt_dlp": version("yt-dlp"),
		"ffmpeg": ffmpeg_version,
		"js_runtime": next((n for n in ("deno", "node", "bun") if shutil.which(n)), None),
		"data_dir": str(DATA_DIR),
		"formats": formats.catalogue(),
	}


# ---- UI ------------------------------------------------------------------------------------------

if UI_DIR.exists():
	app.mount("/assets", StaticFiles(directory=UI_DIR / "assets"), name="assets")

	@app.get("/{path:path}", include_in_schema=False)
	def spa(path: str):
		f = UI_DIR / path
		if path and f.is_file() and UI_DIR in f.resolve().parents:
			return FileResponse(f)
		return FileResponse(UI_DIR / "index.html")


def _open_window(url: str) -> None:
	"""Open the UI in a chromeless app window when Edge/Chrome is around, else the default browser."""
	candidates = []
	if sys.platform == "win32":
		for base in (os.environ.get("PROGRAMFILES(X86)"), os.environ.get("PROGRAMFILES"), os.environ.get("LOCALAPPDATA")):
			if base:
				candidates += [
					Path(base) / "Microsoft/Edge/Application/msedge.exe",
					Path(base) / "Google/Chrome/Application/chrome.exe",
				]
	else:
		candidates += [Path(p) for p in filter(None, (shutil.which("google-chrome"), shutil.which("chromium")))]
	for exe in candidates:
		if exe.exists():
			subprocess.Popen([str(exe), f"--app={url}", "--window-size=1360,880"])
			return
	webbrowser.open(url)


def run() -> None:
	import argparse

	import uvicorn

	parser = argparse.ArgumentParser(description="mp3-x")
	parser.add_argument("--port", type=int, default=8765)
	parser.add_argument("--host", default="127.0.0.1")
	parser.add_argument("--no-window", action="store_true", help="Don't open the app window")
	args = parser.parse_args()
	url = f"http://{args.host}:{args.port}"
	if not args.no_window:
		threading.Timer(1.2, _open_window, args=(url,)).start()
	print(f"mp3-x running at {url}")
	uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
	run()
