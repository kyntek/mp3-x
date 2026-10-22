export type Status = "queued" | "downloading" | "processing" | "done" | "error" | "canceled";
export type Kind = "audio" | "video";

export interface Live {
  stage: string;
  progress: number;
  speed: number | null;
  eta: number | null;
  downloaded: number;
  total: number | null;
}

export interface Item {
  id: number;
  url: string;
  source_id: string | null;
  source: string | null;
  title: string;
  uploader: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null;
  thumbnail_url: string | null;
  kind: Kind;
  container: string;
  quality: string;
  smart_tags: number;
  playlist: string | null;
  status: Status;
  error: string | null;
  file_path: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  created_at: number;
  finished_at: number | null;
  live: Live | null;
  exists: boolean;
  thumb: string | null;
}

export interface FormatSpec {
  id: string;
  label: string;
  qualities: string[];
  default: string;
}

export interface System {
  yt_dlp: string;
  ffmpeg: string | null;
  js_runtime: string | null;
  data_dir: string;
  formats: { audio: FormatSpec[]; video: FormatSpec[] };
}

export interface Settings {
  audio_dir: string;
  video_dir: string;
  default_format: string;
  default_audio_quality: string;
  default_video_quality: string;
  smart_tags: boolean;
  rename_with_tags: boolean;
  prefer_h264: boolean;
  embed_subtitles: boolean;
  max_concurrent: number;
  cookies_file: string;
  ffmpeg_location: string;
}

export interface Entry {
  url: string;
  id?: string | null;
  title?: string | null;
  uploader?: string | null;
  duration?: number | null;
  thumbnail?: string | null;
  source?: string | null;
}

export interface VideoProbe extends Entry {
  type: "video";
  url: string;
  title: string;
  source: string;
  heights: { height: number; size: number | null }[];
  audio_size: number | null;
  in_playlist: boolean;
}

export interface PlaylistProbe {
  type: "playlist";
  title: string;
  uploader: string | null;
  source: string;
  thumbnail: string | null;
  entries: (Entry & { url: string; title: string })[];
}

export type Probe = VideoProbe | PlaylistProbe;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") msg = data.detail;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  items: () => call<Item[]>("GET", "/api/items"),
  system: () => call<System>("GET", "/api/system"),
  settings: () => call<Settings>("GET", "/api/settings"),
  saveSettings: (s: Partial<Settings>) => call<Settings>("PUT", "/api/settings", s),
  probe: (url: string, playlist = false) => call<Probe>("POST", "/api/probe", { url, playlist }),
  enqueue: (entries: Entry[], format: string, quality: string, playlist?: string | null) =>
    call<{ ids: number[] }>("POST", "/api/downloads", { entries, format, quality, playlist: playlist ?? null }),
  cancel: (id: number) => call("POST", `/api/items/${id}/cancel`),
  retry: (id: number) => call("POST", `/api/items/${id}/retry`),
  remove: (id: number, deleteFile = false) => call("DELETE", `/api/items/${id}?delete_file=${deleteFile}`),
  open: (id: number, reveal = false) => call("POST", `/api/items/${id}/open?reveal=${reveal}`),
  openFolder: (which: Kind) => call("POST", "/api/open-folder", { which }),
  clear: (which: "failed") => call("POST", "/api/items/clear", { which }),
  cancelAll: () => call("POST", "/api/items/cancel-all"),
  pick: (kind: "folder" | "file", initial = "") => call<{ path: string | null }>("POST", "/api/pick", { kind, initial }),
};

export const fileUrl = (id: number) => `/api/items/${id}/file`;
