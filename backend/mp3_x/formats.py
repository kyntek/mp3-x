"""Output formats offered in the UI and the yt-dlp options that produce them."""

from __future__ import annotations

from typing import Any

AUDIO = {
	"mp3": {"label": "MP3", "qualities": ["320", "256", "192", "128"], "default": "320"},
	"m4a": {"label": "M4A", "qualities": ["best"], "default": "best"},
	"opus": {"label": "Opus", "qualities": ["best"], "default": "best"},
	"flac": {"label": "FLAC", "qualities": ["best"], "default": "best"},
	"wav": {"label": "WAV", "qualities": ["best"], "default": "best"},
}

VIDEO = {
	"mp4": {"label": "MP4", "qualities": ["best", "2160", "1440", "1080", "720", "480", "360"], "default": "1080"},
	"webm": {"label": "WebM", "qualities": ["best", "2160", "1440", "1080", "720", "480", "360"], "default": "1080"},
	"mkv": {"label": "MKV", "qualities": ["best", "2160", "1440", "1080", "720", "480", "360"], "default": "best"},
}

def kind_of(container: str) -> str:
	if container in AUDIO:
		return "audio"
	if container in VIDEO:
		return "video"
	raise ValueError(f"Unknown format {container!r}")


def catalogue() -> dict[str, Any]:
	return {
		"audio": [{"id": k, **v} for k, v in AUDIO.items()],
		"video": [{"id": k, **v} for k, v in VIDEO.items()],
	}


def normalise_quality(container: str, quality: str | None) -> str:
	spec = AUDIO.get(container) or VIDEO[container]
	return quality if quality in spec["qualities"] else spec["default"]


def ydl_format_opts(container: str, quality: str, prefer_h264: bool, embed_subs: bool, audio_tags: bool = True) -> dict[str, Any]:
	"""yt-dlp options (format selection + postprocessors) for one output format."""
	if container in AUDIO:
		pp: list[dict[str, Any]] = []
		if container == "m4a":
			opts: dict[str, Any] = {"format": "bestaudio[ext=m4a]/bestaudio/best"}
			pp.append({"key": "FFmpegExtractAudio", "preferredcodec": "m4a"})
		else:
			opts = {"format": "bestaudio/best"}
			pp.append({
				"key": "FFmpegExtractAudio",
				"preferredcodec": container,
				"preferredquality": quality if container == "mp3" else "0",
			})
		if audio_tags:
			pp.append({"key": "FFmpegMetadata", "add_metadata": True})
		if audio_tags and container != "wav":
			pp.append({"key": "EmbedThumbnail", "already_have_thumbnail": False})
		opts["postprocessors"] = pp
		opts["writethumbnail"] = audio_tags and container != "wav"
		return opts

	height = None if quality == "best" else int(quality)
	sort = [f"res:{height}"] if height else ["res"]
	if container == "mp4":
		sort += ["vcodec:h264", "acodec:aac"] if prefer_h264 else ["ext:mp4:m4a"]
	elif container == "webm":
		sort += ["ext:webm:webm"]
	cap = f"[height<={height}]" if height else ""
	opts = {
		"format": f"bv*{cap}+ba/b{cap}/bv*+ba/b",
		"format_sort": sort,
		"merge_output_format": container,
		"writethumbnail": container != "webm",
		"postprocessors": [
			{"key": "FFmpegVideoRemuxer", "preferedformat": container},
			{"key": "FFmpegMetadata", "add_metadata": True, "add_chapters": True},
		],
	}
	if container != "webm":
		opts["postprocessors"].append({"key": "EmbedThumbnail", "already_have_thumbnail": False})
	if embed_subs:
		opts.update({"writesubtitles": True, "subtitleslangs": ["en.*", "en"]})
		opts["postprocessors"].append({"key": "FFmpegEmbedSubtitle", "already_have_subtitle": False})
	return opts
