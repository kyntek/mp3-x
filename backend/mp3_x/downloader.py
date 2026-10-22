"""Download queue: runs yt-dlp jobs on worker threads and streams their progress to the UI."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import threading
import time
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadCancelled

from . import formats
from .config import TEMP_DIR, THUMB_DIR, settings
from .db import db

log = logging.getLogger("mp3_x")

ACTIVE = ("queued", "downloading", "processing")
STAGES = {
	"FFmpegExtractAudio": "Converting",
	"Merger": "Merging",
	"FFmpegMerger": "Merging",
	"FFmpegVideoRemuxer": "Remuxing",
	"FFmpegMetadata": "Writing metadata",
	"EmbedThumbnail": "Embedding cover",
	"FFmpegEmbedSubtitle": "Embedding subtitles",
}


def _js_runtimes() -> dict[str, dict]:
	return {name: {} for name in ("deno", "node", "bun") if shutil.which(name)}


def base_ydl_opts() -> dict[str, Any]:
	opts: dict[str, Any] = {"quiet": True, "no_warnings": True, "noprogress": True}
	runtimes = _js_runtimes()
	if runtimes:
		opts["js_runtimes"] = runtimes
	if settings.get("cookies_file"):
		opts["cookiefile"] = settings.get("cookies_file")
	ffmpeg = settings.ffmpeg()
	if ffmpeg:
		opts["ffmpeg_location"] = ffmpeg
	return opts


def _source_of(info: dict[str, Any]) -> str:
	domain = (info.get("webpage_url_domain") or info.get("ie_key") or info.get("extractor_key") or "").lower()
	if "music.youtube" in domain:
		return "YouTube Music"
	if "youtube" in domain or "youtu.be" in domain:
		return "YouTube"
	if "soundcloud" in domain:
		return "SoundCloud"
	return info.get("extractor_key") or domain or "Web"


def _thumb_of(entry: dict[str, Any]) -> str | None:
	if entry.get("thumbnail"):
		return entry["thumbnail"]
	thumbs = entry.get("thumbnails") or []
	if thumbs:
		return thumbs[-1].get("url")
	if entry.get("ie_key") == "Youtube" and entry.get("id"):
		return f"https://i.ytimg.com/vi/{entry['id']}/hqdefault.jpg"
	return None


def probe(url: str, playlist: bool = False) -> dict[str, Any]:
	"""Look a link up without downloading: one video with its qualities, or a playlist's entries."""
	opts = {**base_ydl_opts(), "extract_flat": "in_playlist", "noplaylist": not playlist, "skip_download": True}
	if playlist:
		m = re.search(r"[?&]list=([\w-]+)", url)
		if m and "youtu" in url:
			url = f"https://www.youtube.com/playlist?list={m.group(1)}"
	with YoutubeDL(opts) as ydl:
		info = ydl.extract_info(url, download=False)
	if info is None:
		raise ValueError("Nothing found at that link")

	if info.get("_type") == "playlist" or info.get("entries") is not None:
		entries = []
		for e in list(info.get("entries") or [])[:500]:
			if not e:
				continue
			e_url = e.get("url") or e.get("webpage_url")
			if e.get("ie_key") == "Youtube" and e.get("id"):
				e_url = f"https://www.youtube.com/watch?v={e['id']}"
			if not e_url:
				continue
			entries.append({
				"url": e_url,
				"id": e.get("id"),
				"title": e.get("title") or "Untitled",
				"uploader": e.get("channel") or e.get("uploader"),
				"duration": e.get("duration"),
				"thumbnail": _thumb_of(e),
			})
		return {
			"type": "playlist",
			"title": info.get("title") or "Playlist",
			"uploader": info.get("channel") or info.get("uploader"),
			"source": _source_of(info),
			"thumbnail": _thumb_of(info) or (entries[0]["thumbnail"] if entries else None),
			"entries": entries,
		}

	heights: dict[int, int | None] = {}
	audio_size = None
	for f in info.get("formats") or []:
		size = f.get("filesize") or f.get("filesize_approx")
		if f.get("vcodec") not in (None, "none") and f.get("height"):
			h = int(f["height"])
			heights[h] = max(heights.get(h) or 0, size or 0) or None
		elif f.get("acodec") not in (None, "none") and f.get("vcodec") in (None, "none"):
			audio_size = max(audio_size or 0, size or 0) or audio_size
	return {
		"type": "video",
		"url": info.get("webpage_url") or url,
		"id": info.get("id"),
		"title": info.get("title") or "Untitled",
		"uploader": info.get("channel") or info.get("uploader"),
		"duration": info.get("duration"),
		"thumbnail": _thumb_of(info),
		"source": _source_of(info),
		"heights": [{"height": h, "size": s} for h, s in sorted(heights.items(), reverse=True)],
		"audio_size": audio_size,
		"in_playlist": bool(re.search(r"[?&]list=", url)),
	}


class Job:
	def __init__(self, item: dict[str, Any]):
		self.item = item
		self.cancel = threading.Event()
		self.stage = "Starting"
		self.progress = 0.0
		self.speed: float | None = None
		self.eta: int | None = None
		self.downloaded = 0
		self.total: int | None = None
		self.parts: dict[str, tuple[int, int]] = {}
		self.expected: dict[str, int] = {}
		self.last_emit = 0.0


class Manager:
	def __init__(self) -> None:
		self.jobs: dict[int, Job] = {}
		self.cond = threading.Condition()
		self.loop: asyncio.AbstractEventLoop | None = None
		self.subscribers: set[asyncio.Queue] = set()

	# ---- events -------------------------------------------------------------------------------

	def start(self, loop: asyncio.AbstractEventLoop) -> None:
		self.loop = loop
		threading.Thread(target=self._dispatch, name="dispatcher", daemon=True).start()

	def subscribe(self) -> asyncio.Queue:
		q: asyncio.Queue = asyncio.Queue(maxsize=1000)
		self.subscribers.add(q)
		return q

	def unsubscribe(self, q: asyncio.Queue) -> None:
		self.subscribers.discard(q)

	def _publish(self, event: dict[str, Any]) -> None:
		if not self.loop:
			return
		for q in list(self.subscribers):
			def put(q: asyncio.Queue = q) -> None:
				if not q.full():
					q.put_nowait(event)
			self.loop.call_soon_threadsafe(put)

	def emit(self, item_id: int) -> None:
		item = db.get(item_id)
		if item:
			self._publish({"type": "item", "item": self.serialize(item)})

	def serialize(self, item: dict[str, Any]) -> dict[str, Any]:
		out = dict(item)
		job = self.jobs.get(item["id"])
		out["live"] = None
		if job:
			out["live"] = {
				"stage": job.stage, "progress": job.progress, "speed": job.speed, "eta": job.eta,
				"downloaded": job.downloaded, "total": job.total,
			}
		out["exists"] = bool(item.get("file_path")) and os.path.exists(item["file_path"])
		out["thumb"] = f"/api/items/{item['id']}/thumb" if item.get("thumb_file") else item.get("thumbnail_url")
		return out

	# ---- queue operations ---------------------------------------------------------------------

	def enqueue(self, entries: list[dict[str, Any]], container: str, quality: str | None,
				smart_tags: bool, playlist: str | None) -> list[int]:
		kind = formats.kind_of(container)
		quality = formats.normalise_quality(container, quality)
		ids = []
		for e in entries:
			ids.append(db.insert({
				"url": e["url"], "source_id": e.get("id"), "source": e.get("source"),
				"title": e.get("title") or e["url"], "uploader": e.get("uploader"),
				"duration": e.get("duration"), "thumbnail_url": e.get("thumbnail"),
				"kind": kind, "container": container, "quality": quality,
				"smart_tags": int(bool(smart_tags) and kind == "audio"), "playlist": playlist,
				"status": "queued",
			}))
		for i in ids:
			self.emit(i)
		self.wake()
		return ids

	def wake(self) -> None:
		with self.cond:
			self.cond.notify_all()

	def cancel(self, item_id: int) -> None:
		job = self.jobs.get(item_id)
		if job:
			job.cancel.set()
		else:
			item = db.get(item_id)
			if item and item["status"] == "queued":
				db.update(item_id, status="canceled")
		self.emit(item_id)

	def retry(self, item_id: int) -> None:
		item = db.get(item_id)
		if item and item["status"] in ("error", "canceled"):
			db.update(item_id, status="queued", error=None, created_at=time.time())
			self.emit(item_id)
			self.wake()

	def remove(self, item_id: int, delete_file: bool) -> None:
		item = db.get(item_id)
		if not item:
			return
		if item_id in self.jobs:
			self.jobs[item_id].cancel.set()
		if delete_file and item.get("file_path") and os.path.exists(item["file_path"]):
			os.remove(item["file_path"])
		if item.get("thumb_file"):
			Path(item["thumb_file"]).unlink(missing_ok=True)
		db.delete(item_id)
		self._publish({"type": "removed", "id": item_id})

	def clear(self, statuses: tuple[str, ...]) -> None:
		for i in db.delete_where_status(statuses):
			self._publish({"type": "removed", "id": i})

	# ---- workers ------------------------------------------------------------------------------

	def _dispatch(self) -> None:
		while True:
			with self.cond:
				while len(self.jobs) < settings.get("max_concurrent"):
					item = db.next_queued(set(self.jobs))
					if not item:
						break
					job = Job(item)
					self.jobs[item["id"]] = job
					threading.Thread(target=self._run, args=(job,), name=f"job-{item['id']}", daemon=True).start()
				self.cond.wait(timeout=2)

	def _run(self, job: Job) -> None:
		item_id = job.item["id"]
		try:
			db.update(item_id, status="downloading", error=None)
			self.emit(item_id)
			self._download(job)
		except DownloadCancelled:
			db.update(item_id, status="canceled")
		except Exception as e:  # surfaced in the UI as the row's error
			log.exception("Download %s failed", item_id)
			msg = re.sub(r"\x1b\[[0-9;]*m", "", str(e)).replace("ERROR: ", "").strip()
			msg = re.sub(r"^\[[\w:]+\] [\w-]+: ", "", msg)
			db.update(item_id, status="error", error=msg[:500] or type(e).__name__)
		finally:
			self.jobs.pop(item_id, None)
			shutil.rmtree(TEMP_DIR / str(item_id), ignore_errors=True)
			self.emit(item_id)
			self.wake()

	def _progress_hook(self, job: Job, d: dict[str, Any]) -> None:
		if job.cancel.is_set():
			raise DownloadCancelled("Canceled")
		fid = str((d.get("info_dict") or {}).get("format_id") or d.get("filename"))
		if d["status"] == "downloading":
			total = d.get("total_bytes") or d.get("total_bytes_estimate") or job.expected.get(fid) or 0
			job.parts[fid] = (int(d.get("downloaded_bytes") or 0), int(total))
			job.speed = d.get("speed")
			job.eta = d.get("eta")
			job.stage = "Downloading"
		elif d["status"] == "finished":
			done = int(d.get("total_bytes") or d.get("downloaded_bytes") or 0)
			job.parts[fid] = (done, done)
		downloaded = sum(p[0] for p in job.parts.values())
		total = sum(p[1] for p in job.parts.values())
		total += sum(v for k, v in job.expected.items() if k not in job.parts)
		job.downloaded, job.total = downloaded, total or None
		job.progress = min(downloaded / total, 1.0) if total else 0.0
		now = time.monotonic()
		if now - job.last_emit > 0.3 or d["status"] == "finished":
			job.last_emit = now
			self.emit(job.item["id"])

	def _pp_hook(self, job: Job, d: dict[str, Any]) -> None:
		if job.cancel.is_set():
			raise DownloadCancelled("Canceled")
		if d.get("status") == "started" and d.get("postprocessor") in STAGES:
			if job.item["status"] != "processing":
				job.item["status"] = "processing"
				db.update(job.item["id"], status="processing")
			job.stage = STAGES[d["postprocessor"]]
			job.progress = 1.0
			job.speed = job.eta = None
			self.emit(job.item["id"])

	def _download(self, job: Job) -> None:
		item = job.item
		item_id = item["id"]
		container, quality = item["container"], item["quality"]
		out_dir = Path(settings.get("audio_dir" if item["kind"] == "audio" else "video_dir"))
		if item.get("playlist"):
			out_dir = out_dir / _safe_name(item["playlist"])
		out_dir.mkdir(parents=True, exist_ok=True)

		opts = {
			**base_ydl_opts(),
			**formats.ydl_format_opts(container, quality, settings.get("prefer_h264"), settings.get("embed_subtitles"), bool(item["smart_tags"])),
			"noplaylist": True,
			"overwrites": False,
			"paths": {"home": str(out_dir), "temp": str(TEMP_DIR / str(item_id))},
			"outtmpl": "%(title).150B.%(ext)s",
			"progress_hooks": [lambda d: self._progress_hook(job, d)],
			"postprocessor_hooks": [lambda d: self._pp_hook(job, d)],
		}
		with YoutubeDL(opts) as ydl:
			job.stage = "Fetching info"
			self.emit(item_id)
			info = ydl.extract_info(item["url"], download=False)
			if info is None:
				raise RuntimeError("Nothing found at that link")
			if job.cancel.is_set():
				raise DownloadCancelled("Canceled")
			for f in info.get("requested_formats") or [info]:
				size = f.get("filesize") or f.get("filesize_approx")
				if size:
					job.expected[str(f.get("format_id"))] = int(size)
			meta = {
				"title": info.get("title") or item["title"],
				"uploader": info.get("channel") or info.get("uploader"),
				"duration": info.get("duration"),
				"thumbnail_url": info.get("thumbnail") or item.get("thumbnail_url"),
				"source_id": info.get("id"),
				"source": _source_of(info),
				"width": info.get("width"),
				"height": info.get("height"),
			}
			db.update(item_id, **meta)
			item.update(meta)
			job.stage = "Downloading"
			self.emit(item_id)
			result = ydl.process_ie_result(info, download=True)

		downloads = result.get("requested_downloads") or []
		path = Path(downloads[0]["filepath"]) if downloads and downloads[0].get("filepath") else None
		if not path or not path.exists():
			raise RuntimeError("yt-dlp finished but the output file is missing")

		artist, album = None, None
		if item["kind"] == "audio":
			artist = result.get("artist") or result.get("creator") or result.get("uploader")
			album = result.get("album")
			if item["smart_tags"]:
				# Read the tags yt-dlp actually wrote, keeping library and filename consistent.
				try:
					from mediafile import MediaFile
					# WAV uses RIFF tags, which MediaFile does not read.
					tags = MediaFile(str(path)) if container != "wav" else None
					title = (tags.title if tags else None) or result.get("track") or result.get("title")
					if tags:
						artist, album = tags.artist or artist, tags.album or album
					if title:
						db.update(item_id, title=title)
						if settings.get("rename_with_tags"):
							stem = f"{artist} - {title}" if artist else title
							path = _rename(path, _safe_name(stem))
				except Exception as e:
					log.warning("Could not read tags or rename download %s: %s", item_id, e)

		thumb = _save_thumb(item_id, path, item.get("thumbnail_url"), item["kind"] == "audio")
		db.update(
			item_id, status="done", file_path=str(path), file_size=path.stat().st_size,
			artist=artist, album=album, thumb_file=thumb, finished_at=time.time(),
		)


def _safe_name(name: str) -> str:
	name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name).strip().rstrip(".")
	return name[:150] or "Untitled"


def _rename(path: Path, stem: str) -> Path:
	target = path.with_name(stem + path.suffix)
	if target == path:
		return path
	n = 2
	while target.exists():
		target = path.with_name(f"{stem} ({n}){path.suffix}")
		n += 1
	path.rename(target)
	return target


def _save_thumb(item_id: int, media: Path, url: str | None, prefer_embedded: bool) -> str | None:
	"""Cache a small cover for the library: the embedded cover for audio, else the thumbnail."""
	from PIL import Image

	data: bytes | None = None
	if prefer_embedded:
		try:
			from mediafile import MediaFile
			data = MediaFile(str(media)).art
		except Exception:
			data = None
	if not data and url:
		try:
			with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=15) as r:
				data = r.read()
		except Exception:
			data = None
	if not data:
		return None
	try:
		img = Image.open(BytesIO(data)).convert("RGB")
		img.thumbnail((640, 640))
		out = THUMB_DIR / f"{item_id}.jpg"
		img.save(out, "JPEG", quality=86)
		return str(out)
	except Exception:
		return None


manager = Manager()
