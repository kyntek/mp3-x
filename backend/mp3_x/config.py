"""Paths and user settings, persisted as JSON in the app's data folder."""

from __future__ import annotations

import json
import os
import shutil
import threading
from pathlib import Path
from typing import Any

APP_NAME = "mp3-x"


def _data_dir() -> Path:
	override = os.environ.get("MP3X_APP_DATA")
	if override:
		return Path(override)
	if os.name == "nt" and os.environ.get("APPDATA"):
		return Path(os.environ["APPDATA"]) / APP_NAME
	return Path.home() / ".mp3-x"


DATA_DIR = _data_dir()
DB_PATH = DATA_DIR / "library.db"
THUMB_DIR = DATA_DIR / "thumbs"
TEMP_DIR = DATA_DIR / "temp"
SETTINGS_PATH = DATA_DIR / "settings.json"

for _d in (DATA_DIR, THUMB_DIR, TEMP_DIR):
	_d.mkdir(parents=True, exist_ok=True)


def _default_dir(*names: str) -> str:
	for name in names:
		p = Path.home() / name
		if p.exists():
			return str(p / APP_NAME)
	return str(Path.home() / APP_NAME)


DEFAULTS: dict[str, Any] = {
	"audio_dir": _default_dir("Music"),
	"video_dir": _default_dir("Videos"),
	"default_format": "mp3",
	"default_audio_quality": "320",
	"default_video_quality": "1080",
	"smart_tags": True,
	"rename_with_tags": True,
	"prefer_h264": True,
	"embed_subtitles": False,
	"max_concurrent": 3,
	"cookies_file": "",
	"ffmpeg_location": "",
}


class Settings:
	def __init__(self, path: Path = SETTINGS_PATH):
		self._path = path
		self._lock = threading.Lock()
		self._data = dict(DEFAULTS)
		if path.exists():
			try:
				stored = json.loads(path.read_text(encoding="utf-8"))
				self._data.update({k: v for k, v in stored.items() if k in DEFAULTS})
			except (OSError, ValueError):
				pass

	def get(self, key: str) -> Any:
		with self._lock:
			return self._data[key]

	def all(self) -> dict[str, Any]:
		with self._lock:
			return dict(self._data)

	def update(self, values: dict[str, Any]) -> dict[str, Any]:
		with self._lock:
			for k, v in values.items():
				if k not in DEFAULTS:
					continue
				default = DEFAULTS[k]
				if isinstance(default, bool):
					v = bool(v)
				elif isinstance(default, int):
					v = max(1, min(8, int(v)))
				else:
					v = str(v).strip()
				self._data[k] = v
			self._path.write_text(json.dumps(self._data, indent=2), encoding="utf-8")
			return dict(self._data)

	def ffmpeg(self) -> str | None:
		loc = self.get("ffmpeg_location")
		if loc:
			p = Path(loc)
			return str(p.parent if p.is_file() else p)
		found = shutil.which("ffmpeg")
		return str(Path(found).parent) if found else None


settings = Settings()
