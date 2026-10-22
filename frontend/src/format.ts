import type { Item } from "./api";

export function bytes(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return "–";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : digits)} ${units[i]}`;
}

export function duration(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return "–";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

export function eta(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return "";
  if (sec < 60) return `${Math.max(1, Math.round(sec))} s left`;
  if (sec < 3600) return `${Math.round(sec / 60)} min left`;
  return `${(sec / 3600).toFixed(1)} h left`;
}

export function when(ts: number | null | undefined): string {
  if (!ts) return "–";
  const d = new Date(ts * 1000);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function qualityLabel(container: string, q: string): string {
  if (q === "best") return container === "mp3" ? "Best" : ["mp4", "webm", "mkv"].includes(container) ? "Best available" : "Original";
  if (["mp4", "webm", "mkv"].includes(container)) return q === "2160" ? "4K" : `${q}p`;
  return `${q} kbps`;
}

/** For saved videos the real resolution wins over the one asked for (a 240p upload saved at "1080p" is still 240p). */
export function formatLabel(item: Pick<Item, "container" | "quality"> & Partial<Pick<Item, "width" | "height" | "status">>): string {
  const side = item.status === "done" && item.width && item.height ? Math.min(item.width, item.height) : null;
  const q = side && ["mp4", "webm", "mkv"].includes(item.container) ? qualityLabel(item.container, String(side)) : qualityLabel(item.container, item.quality);
  return `${item.container.toUpperCase()} · ${q}`;
}

export function byline(item: Pick<Item, "artist" | "uploader" | "album">): string {
  return item.artist || item.uploader || "Unknown";
}
