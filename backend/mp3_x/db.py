"""SQLite store for every download: the queue and the library are the same table."""

from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
	id            INTEGER PRIMARY KEY AUTOINCREMENT,
	url           TEXT NOT NULL,
	source_id     TEXT,
	source        TEXT,
	title         TEXT NOT NULL,
	uploader      TEXT,
	artist        TEXT,
	album         TEXT,
	duration      REAL,
	thumbnail_url TEXT,
	thumb_file    TEXT,
	kind          TEXT NOT NULL,          -- audio | video
	container     TEXT NOT NULL,          -- mp3, m4a, mp4 ...
	quality       TEXT NOT NULL,          -- 320, best, 1080 ...
	smart_tags    INTEGER NOT NULL DEFAULT 1,
	playlist      TEXT,
	status        TEXT NOT NULL,          -- queued | downloading | processing | done | error | canceled
	error         TEXT,
	file_path     TEXT,
	file_size     INTEGER,
	width         INTEGER,
	height        INTEGER,
	created_at    REAL NOT NULL,
	finished_at   REAL
);
CREATE INDEX IF NOT EXISTS items_status ON items(status);
"""

COLUMNS = (
	"url", "source_id", "source", "title", "uploader", "artist", "album", "duration", "thumbnail_url",
	"thumb_file", "kind", "container", "quality", "smart_tags", "playlist", "status", "error", "file_path",
	"file_size", "width", "height", "created_at", "finished_at",
)


class DB:
	def __init__(self, path: Path = DB_PATH):
		self._conn = sqlite3.connect(path, check_same_thread=False)
		self._conn.row_factory = sqlite3.Row
		self._lock = threading.Lock()
		with self._lock:
			self._conn.executescript(SCHEMA)
			# Anything that was mid-flight when the app closed goes back in the queue.
			self._conn.execute(
				"UPDATE items SET status='queued' WHERE status IN ('downloading','processing')"
			)
			self._conn.commit()

	def insert(self, values: dict[str, Any]) -> int:
		values = {**values, "created_at": values.get("created_at") or time.time()}
		cols = [c for c in COLUMNS if c in values]
		with self._lock:
			cur = self._conn.execute(
				f"INSERT INTO items ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})",
				[values[c] for c in cols],
			)
			self._conn.commit()
			return int(cur.lastrowid or 0)

	def update(self, item_id: int, **values: Any) -> None:
		cols = [c for c in values if c in COLUMNS]
		if not cols:
			return
		with self._lock:
			self._conn.execute(
				f"UPDATE items SET {','.join(f'{c}=?' for c in cols)} WHERE id=?",
				[values[c] for c in cols] + [item_id],
			)
			self._conn.commit()

	def get(self, item_id: int) -> dict[str, Any] | None:
		with self._lock:
			row = self._conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
		return dict(row) if row else None

	def list(self, statuses: tuple[str, ...] | None = None) -> list[dict[str, Any]]:
		q = "SELECT * FROM items"
		args: list[Any] = []
		if statuses:
			q += f" WHERE status IN ({','.join('?' for _ in statuses)})"
			args.extend(statuses)
		q += " ORDER BY created_at DESC, id DESC"
		with self._lock:
			return [dict(r) for r in self._conn.execute(q, args).fetchall()]

	def next_queued(self, exclude: set[int]) -> dict[str, Any] | None:
		with self._lock:
			rows = self._conn.execute(
				"SELECT * FROM items WHERE status='queued' ORDER BY created_at ASC, id ASC"
			).fetchall()
		for r in rows:
			if r["id"] not in exclude:
				return dict(r)
		return None

	def delete(self, item_id: int) -> None:
		with self._lock:
			self._conn.execute("DELETE FROM items WHERE id=?", (item_id,))
			self._conn.commit()

	def delete_where_status(self, statuses: tuple[str, ...]) -> list[int]:
		with self._lock:
			ids = [
				r[0]
				for r in self._conn.execute(
					f"SELECT id FROM items WHERE status IN ({','.join('?' for _ in statuses)})", statuses
				).fetchall()
			]
			self._conn.execute(
				f"DELETE FROM items WHERE status IN ({','.join('?' for _ in statuses)})", statuses
			)
			self._conn.commit()
			return ids


db = DB()
