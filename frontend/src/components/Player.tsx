import { FolderOpen, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, fileUrl, type Item } from "../api";
import { byline, duration, formatLabel } from "../format";
import { useStore } from "../store";
import { IconButton, Thumb } from "./ui";

function useNeighbours(item: Item | null) {
  const { playQueue, play } = useStore();
  const idx = item ? playQueue.findIndex((q) => q.id === item.id) : -1;
  const prev = idx > 0 ? playQueue[idx - 1] : null;
  const next = idx >= 0 && idx < playQueue.length - 1 ? playQueue[idx + 1] : null;
  return { prev, next, go: (i: Item | null) => i && play(i) };
}

/** The player: a bar along the bottom for music, a sheet over the app for video. */
export function Player() {
  const { playing } = useStore();
  if (!playing) return null;
  return playing.kind === "video" ? <VideoSheet item={playing} /> : <AudioBar item={playing} />;
}

function AudioBar({ item }: { item: Item }) {
  const { stop, toast } = useStore();
  const { prev, next, go } = useNeighbours(item);
  const audio = useRef<HTMLAudioElement>(null);
  const [paused, setPaused] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(item.duration ?? 0);
  const [volume, setVolume] = useState(() => Number(localStorage.getItem("ytd.volume") ?? 0.8));
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.volume = volume;
    a.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    setTime(0);
    audio.current?.play().catch(() => setPaused(true));
  }, [item.id]);

  // Space toggles play when nothing else wants the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement).closest("input, textarea, button, [role=slider]")) return;
      e.preventDefault();
      const a = audio.current;
      if (a) a.paused ? a.play() : a.pause();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () => {
    const a = audio.current;
    if (a) a.paused ? a.play() : a.pause();
  };

  return (
    <div className="row-in grid h-[76px] grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-6 border-t border-rule bg-ground px-[29px] max-md:grid-cols-[minmax(0,1fr)_auto] max-md:px-4">
      <audio
        ref={audio}
        src={fileUrl(item.id)}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setLength(e.currentTarget.duration)}
        onEnded={() => (next ? go(next) : setPaused(true))}
        onError={() => toast({ tone: "error", text: "This file can't be played here. Try “Open with default app”." })}
      />
      <div className="flex min-w-0 items-center gap-3">
        <Thumb src={item.thumb} kind="audio" className="size-12 rounded-lg" />
        <div className="min-w-0">
          <div className="truncate text-body font-medium">{item.title}</div>
          <div className="truncate text-small text-muted">
            {byline(item)} · {formatLabel(item)}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 max-md:hidden">
        <div className="flex items-center gap-2">
          <IconButton label="Previous" onClick={() => go(prev)} disabled={!prev}>
            <SkipBack size={16} fill="currentColor" />
          </IconButton>
          <button
            onClick={toggle}
            aria-label={paused ? "Play" : "Pause"}
            className="flex size-9 items-center justify-center rounded-full bg-ink text-black transition-transform hover:scale-105 active:scale-95"
          >
            {paused ? <Play size={16} fill="currentColor" className="ml-0.5" /> : <Pause size={16} fill="currentColor" />}
          </button>
          <IconButton label="Next" onClick={() => go(next)} disabled={!next}>
            <SkipForward size={16} fill="currentColor" />
          </IconButton>
        </div>
        <div className="flex w-full max-w-[520px] items-center gap-2.5">
          <span className="w-10 text-right text-small text-faint tnum">{duration(time)}</span>
          <Seek value={time} max={length || 1} onChange={(v) => audio.current && (audio.current.currentTime = v)} label="Seek" />
          <span className="w-10 text-small text-faint tnum">{duration(length)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1">
        <button
          onClick={toggle}
          aria-label={paused ? "Play" : "Pause"}
          className="hidden size-9 items-center justify-center rounded-full bg-ink text-black max-md:flex"
        >
          {paused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
        </button>
        <IconButton label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)} className="max-md:hidden">
          {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </IconButton>
        <div className="w-24 max-md:hidden">
          <Seek
            value={muted ? 0 : volume}
            max={1}
            label="Volume"
            onChange={(v) => {
              setVolume(v);
              setMuted(false);
              localStorage.setItem("ytd.volume", String(v));
            }}
          />
        </div>
        <IconButton label="Show in folder" onClick={() => api.open(item.id, true)} className="max-md:hidden">
          <FolderOpen size={16} />
        </IconButton>
        <IconButton label="Close player" onClick={stop}>
          <X size={16} />
        </IconButton>
      </div>
    </div>
  );
}

function Seek({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="relative flex h-4 flex-1 items-center">
      <div className="absolute inset-x-0 h-1 overflow-hidden rounded-full bg-control">
        <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
      <input
        type="range"
        className="seek relative w-full"
        min={0}
        max={max}
        step={max > 1 ? 0.5 : 0.01}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function VideoSheet({ item }: { item: Item }) {
  const { stop } = useStore();
  const { prev, next, go } = useNeighbours(item);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stop();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stop]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ground p-6 max-sm:p-3" onMouseDown={(e) => e.target === e.currentTarget && stop()}>
      <div className="mx-auto flex w-full max-w-[1280px] min-h-0 flex-1 flex-col pop-in">
        <div className="mb-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-section font-medium">{item.title}</h2>
            <p className="truncate text-small text-muted">
              {byline(item)} · {formatLabel(item)}
              {item.height ? ` · ${item.width}×${item.height}` : ""}
            </p>
          </div>
          <IconButton label="Previous" onClick={() => go(prev)} disabled={!prev}>
            <SkipBack size={16} />
          </IconButton>
          <IconButton label="Next" onClick={() => go(next)} disabled={!next}>
            <SkipForward size={16} />
          </IconButton>
          <IconButton label="Show in folder" onClick={() => api.open(item.id, true)}>
            <FolderOpen size={16} />
          </IconButton>
          <IconButton label="Close" onClick={stop}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-card bg-surface">
          <video
            key={item.id}
            src={fileUrl(item.id)}
            poster={item.thumb ?? undefined}
            controls
            autoPlay
            onEnded={() => next && go(next)}
            className="size-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
