<img src="assets/icon.svg" width="64" height="64" alt="mp3-x">

# mp3-x

A local media downloader with a clean, dark interface. Save YouTube, YouTube Music and SoundCloud links in your preferred format, then browse and play your downloads from one library.

## About

mp3-x brings downloading, format conversion and library playback into one local interface. It uses yt-dlp to retrieve media and FFmpeg to convert files and embed supported metadata.

The app runs on your computer, with a Python API serving a React interface in a browser or app window. Downloads stay in folders you choose, while your library, cached artwork and settings are stored locally.

## Features

- **Audio and video:** MP3, MP4, M4A, Opus, FLAC, WAV, WebM and MKV, with format-specific quality options.
- **Quick downloads:** paste a link into the download bar or use Ctrl+V. Your last format and quality selection is remembered.
- **Playlists:** choose individual tracks or videos and optionally save them together in a playlist folder.
- **Download queue:** live progress, speed and time remaining, cancellation, retry, and up to eight simultaneous downloads.
- **Media library:** list and grid views, search, sorting, and filters for music, videos and missing files.
- **Playback:** built-in audio and video players, plus shortcuts to reveal downloaded files in Explorer.
- **Metadata:** embed available source tags and artwork, with optional `Artist - Title` filenames. Metadata depends on the source; the uploader may be used when artist information is unavailable. WAV supports text tags only.
- **Video options:** preferred H.264 encoding when available, embedded chapters and thumbnails in supported containers, and optional English subtitles.
- **Settings:** separate audio and video folders, default formats, metadata preferences, concurrency, cookies and FFmpeg location.

## Requirements

- [uv](https://docs.astral.sh/uv/) for Python and dependency management. The app requires Python 3.11 or newer.
- [Node.js](https://nodejs.org/) 22 or newer to build the interface and support YouTube JavaScript challenges.
- [FFmpeg](https://ffmpeg.org/) on your PATH, or configured under **Settings > Engine**.

On Windows, FFmpeg can be installed with `winget install Gyan.FFmpeg`.

## Getting started

On Windows, double-click `start.bat`. On the first run, it installs dependencies and builds the interface, then launches the app in an Edge or Chrome app window.

To start manually:

```sh
uv sync
cd frontend
npm ci
npm run build
cd ..
uv run mp3-x
```

The local interface is served at `http://127.0.0.1:8765`.

```sh
uv run mp3-x --port 9000
uv run mp3-x --no-window
```

## Storage

Default download folders are `Music\mp3-x` and `Videos\mp3-x`. Change them in Settings.

The library database, cached artwork and settings are stored in `%APPDATA%\mp3-x` on Windows. Set `MP3X_APP_DATA` to use a different app-data directory.

## Signed-in downloads

Select an exported `cookies.txt` file under **Settings > Signed-in downloads** for content that requires your account's access.

## Updating

Update the download engine:

```sh
uv lock --upgrade-package yt-dlp
uv sync
```

After updating frontend source files, rebuild the interface and restart the app:

```sh
cd frontend
npm ci
npm run build
```

## Development

Start the API:

```sh
uv run mp3-x --no-window
```

In a second terminal, start the frontend development server:

```sh
cd frontend
npm run dev
```

The frontend runs on port 5173 and proxies API requests to port 8765.

- **Backend:** Python, FastAPI, yt-dlp, FFmpeg and SQLite in `backend/mp3_x`.
- **Frontend:** React, TypeScript and Tailwind CSS in `frontend/src`.
- **Live progress:** server-sent events.

Run the local audio conversion and metadata smoke check with FFmpeg installed:

```sh
uv run python tests/smoke_tags.py
```

The check uses temporary media and app data without downloading external content.
