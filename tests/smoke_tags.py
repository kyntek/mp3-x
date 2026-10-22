"""Run with uv run python tests/smoke_tags.py (requires FFmpeg, no external downloads)."""
import os
import json
import subprocess
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch


def main():
    with tempfile.TemporaryDirectory(prefix="mp3-x-tags-") as tmp:
        root = Path(tmp)
        os.environ["MP3X_APP_DATA"] = str(root / "data")
        from PIL import Image
        from mediafile import MediaFile
        from yt_dlp import YoutubeDL
        from mp3_x.config import settings
        from mp3_x.db import db
        from mp3_x.downloader import Job, Manager
        from mp3_x.formats import AUDIO, ydl_format_opts
        from mp3_x.main import api_system

        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                        "sine=frequency=440:duration=0.2", str(root / "tone.wav")], check=True)
        Image.new("RGB", (64, 64), "orange").save(root / "cover.jpg")

        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=tmp))
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base = f"http://127.0.0.1:{server.server_port}"
        manager = Manager()
        settings.update({"audio_dir": str(root / "out"), "rename_with_tags": True})
        try:
            for container in AUDIO:
                for enabled in (True, False):
                    info = {"id": "tone", "title": f"Video {container} {enabled}",
                            "track": "Track", "artist": "Artist", "album": "Album",
                            "release_date": "20250102", "uploader": "Uploader",
                            "url": base + "/tone.wav", "ext": "wav",
                            "vcodec": "none", "acodec": "pcm_s16le",
                            "thumbnail": base + "/cover.jpg",
                            "extractor": "generic", "webpage_url": base + "/tone.wav"}
                    item_id = manager.enqueue([{"url": info["url"]}], container, None, enabled, None)[0]
                    # Only extraction is stubbed; downloading, conversion, embedding and DB writes are real.
                    with patch.object(YoutubeDL, "extract_info", return_value=info):
                        manager._download(Job(db.get(item_id)))
                    item = db.get(item_id)
                    media = MediaFile(item["file_path"])
                    assert item["status"] == "done" and Path(item["file_path"]).exists()
                    if enabled:
                        if container == "wav":
                            probe = json.loads(subprocess.check_output(["ffprobe", "-v", "quiet", "-show_format", "-of", "json", item["file_path"]]))
                            tags = probe["format"]["tags"]
                            assert (tags["title"], tags["artist"], tags["album"]) == ("Track", "Artist", "Album")
                        else:
                            assert (media.title, media.artist, media.album) == ("Track", "Artist", "Album"), container
                        assert (item["title"], item["artist"], item["album"]) == ("Track", "Artist", "Album")
                        assert Path(item["file_path"]).stem == "Artist - Track"
                        if container != "wav":
                            assert media.art, container
                    else:
                        assert not media.title and not media.art, container
                        assert Path(item["file_path"]).stem == info["title"]
                    print(f"PASS {container}: tags {enabled}")
            # Audio preference must not affect video metadata/chapters.
            for container in ("mp4", "mkv", "webm"):
                assert ydl_format_opts(container, "720", True, False, False) == ydl_format_opts(container, "720", True, False, True)
            assert "shira" not in api_system()
            assert api_system()["yt_dlp"]
            print("PASS video options and system API without Shira")
        finally:
            server.shutdown()
            server.server_close()
            worker.join()
            db._conn.close()


if __name__ == "__main__":
    main()
