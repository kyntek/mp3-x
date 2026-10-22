import { ArrowDownUp, LayoutGrid, List, Play, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Item } from "../api";
import { byline, bytes, duration, formatLabel, when } from "../format";
import { useStore } from "../store";
import { SavedActions } from "./ItemActions";
import { MenuItem, Pill, Popover, Thumb } from "./ui";

type Filter = "all" | "audio" | "video" | "missing";
type Sort = "added" | "title" | "artist" | "size" | "length";

const SORTS: { id: Sort; label: string }[] = [
  { id: "added", label: "Recently added" },
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist / channel" },
  { id: "size", label: "File size" },
  { id: "length", label: "Length" },
];

const stored = <T,>(key: string, fallback: T): T => (localStorage.getItem(key) as T) ?? fallback;

export function LibraryView() {
  const { items, playing } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSortState] = useState<Sort>(() => stored("ytd.sort", "added"));
  const [layout, setLayoutState] = useState<"list" | "grid">(() => stored("ytd.layout", "list"));
  const setSort = (s: Sort) => (setSortState(s), localStorage.setItem("ytd.sort", s));
  const setLayout = (l: "list" | "grid") => (setLayoutState(l), localStorage.setItem("ytd.layout", l));

  const library = useMemo(() => items.filter((i) => i.status === "done"), [items]);
  const groups = useMemo(() => {
    const of = (f: Filter) =>
      library.filter((i) => (f === "all" ? true : f === "missing" ? !i.exists : i.kind === f && i.exists));
    return {
      all: of("all"),
      audio: of("audio"),
      video: of("video"),
      missing: of("missing"),
    };
  }, [library]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = groups[filter].filter(
      (i) => !q || [i.title, i.artist, i.uploader, i.album, i.playlist, i.container].some((v) => v?.toLowerCase().includes(q)),
    );
    const cmp: Record<Sort, (a: Item, b: Item) => number> = {
      added: (a, b) => (b.finished_at ?? 0) - (a.finished_at ?? 0),
      title: (a, b) => a.title.localeCompare(b.title),
      artist: (a, b) => byline(a).localeCompare(byline(b)) || a.title.localeCompare(b.title),
      size: (a, b) => (b.file_size ?? 0) - (a.file_size ?? 0),
      length: (a, b) => (b.duration ?? 0) - (a.duration ?? 0),
    };
    return [...rows].sort(cmp[sort]);
  }, [groups, filter, query, sort]);

  const playable = shown.filter((i) => i.exists);
  const size = (rows: Item[]) => rows.reduce((s, i) => s + (i.exists ? i.file_size ?? 0 : 0), 0);
  const hours = groups.all.reduce((s, i) => s + (i.duration ?? 0), 0) / 3600;

  const cards: { id: Filter; label: string; rows: Item[] }[] = [
    { id: "all", label: "Everything", rows: groups.all },
    { id: "audio", label: "Music", rows: groups.audio },
    { id: "video", label: "Videos", rows: groups.video },
    { id: "missing", label: "Missing files", rows: groups.missing },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col px-[29px] pt-7 pb-16 max-sm:px-4">
      <h1 className="text-title font-semibold">Library</h1>
      <p className="mt-1 text-body text-muted tnum">
        {groups.all.length} {groups.all.length === 1 ? "file" : "files"} · {bytes(size(groups.all))} on disk · {hours >= 1 ? `${hours.toFixed(1)} hours` : `${Math.round(hours * 60)} minutes`} of media
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4" role="tablist" aria-label="Filter library">
        {cards.map((c) => {
          const active = filter === c.id;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(c.id)}
              className={`flex h-[61px] flex-col justify-center rounded-[14px] px-3 text-left transition-colors ${
                active ? "bg-accent-pale shadow-[inset_0_0_0_1.5px_var(--color-accent)]" : "bg-surface hover:bg-raised"
              }`}
            >
              <span className="text-[13px] text-faint">{c.label}</span>
              <span className="text-section font-semibold tnum">
                {c.rows.length}
                {c.id !== "missing" && <span className="ml-2 text-small font-normal text-faint">{bytes(size(c.rows))}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 mb-3 flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-full bg-surface px-3.5 transition-colors focus-within:bg-raised md:max-w-[360px]">
          <Search size={15} className="shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, artists, albums"
            className="h-full min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-faint"
            aria-label="Search library"
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")} className="text-faint hover:text-ink">
              <X size={14} />
            </button>
          )}
        </label>
        <div className="flex-1" />
        <Popover
          align="right"
          width={210}
          trigger={(_, toggle) => (
            <button onClick={toggle} className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-body text-muted transition-colors hover:bg-raised hover:text-ink">
              <ArrowDownUp size={15} /> {SORTS.find((s) => s.id === sort)?.label}
            </button>
          )}
        >
          {(close) =>
            SORTS.map((s) => (
              <MenuItem key={s.id} selected={s.id === sort} onClick={() => (setSort(s.id), close())}>
                {s.label}
              </MenuItem>
            ))
          }
        </Popover>
        <div className="flex rounded-full bg-surface p-0.5" role="radiogroup" aria-label="Layout">
          {(["list", "grid"] as const).map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={layout === l}
              aria-label={l === "list" ? "List" : "Grid"}
              onClick={() => setLayout(l)}
              className={`flex size-8 items-center justify-center rounded-full transition-colors ${layout === l ? "bg-nested text-ink" : "text-faint hover:text-ink"}`}
            >
              {l === "list" ? <List size={15} /> : <LayoutGrid size={15} />}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-card bg-surface px-[22px] py-12 text-center">
          <p className="text-body text-ink">{emptyText(filter, query, library.length)}</p>
          <p className="mt-1 text-small text-faint">{emptyHint(filter, query)}</p>
        </div>
      ) : layout === "list" ? (
        <ListLayout rows={shown} queue={playable} playingId={playing?.id} />
      ) : (
        <GridLayout rows={shown} queue={playable} square={filter === "audio"} playingId={playing?.id} />
      )}
    </div>
  );
}

function emptyText(filter: Filter, query: string, total: number) {
  if (query) return `Nothing matches “${query}”`;
  if (!total) return "Your library is empty";
  return { all: "Your library is empty", audio: "No music yet", video: "No videos yet", missing: "Every file is where it should be" }[filter];
}
function emptyHint(filter: Filter, query: string) {
  if (query) return "Search looks at titles, artists, albums, playlists and formats.";
  if (filter === "missing") return "Files you move or delete outside the app show up here.";
  return "Finished downloads appear here automatically.";
}

function ListLayout({ rows, queue, playingId }: { rows: Item[]; queue: Item[]; playingId?: number }) {
  const { play } = useStore();
  return (
    <div className="rounded-card bg-surface p-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_120px_64px_80px_120px_104px] items-center gap-4 px-3 pt-2 pb-2 text-small text-faint max-lg:grid-cols-[minmax(0,1fr)_64px_104px] max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-2">
        <span>Title</span>
        <span className="max-lg:hidden">Format</span>
        <span className="text-right max-sm:hidden">Length</span>
        <span className="text-right max-lg:hidden">Size</span>
        <span className="text-right max-lg:hidden">Added</span>
        <span />
      </div>
      <ul>
        {rows.map((i) => {
          const isPlaying = i.id === playingId;
          return (
            <li
              key={i.id}
              onDoubleClick={() => i.exists && play(i, queue)}
              className={`group grid min-h-[60px] grid-cols-[minmax(0,1fr)_120px_64px_80px_120px_104px] items-center gap-4 rounded-[14px] px-3 py-2 transition-colors hover:bg-raised max-lg:grid-cols-[minmax(0,1fr)_64px_104px] max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-2 ${isPlaying ? "bg-raised" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => i.exists && play(i, queue)}
                  disabled={!i.exists}
                  aria-label={`Play ${i.title}`}
                  className="relative shrink-0 rounded-lg"
                >
                  <span className="flex w-[78px] justify-center max-sm:w-14">
                    <Thumb src={i.thumb} kind={i.kind} className={`rounded-lg ${i.kind === "audio" ? "size-11" : "h-11 w-[78px] max-sm:h-8 max-sm:w-14"}`} />
                  </span>
                  {i.exists && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg text-ink opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="absolute inset-0 m-auto h-11 w-11 rounded-lg bg-black/60" />
                      <span className="relative">
                      <Play size={16} fill="currentColor" />
                      </span>
                    </span>
                  )}
                </button>
                <div className="min-w-0">
                  <div className={`truncate text-body font-medium ${isPlaying ? "text-accent" : i.exists ? "text-ink" : "text-faint"}`} title={i.title}>
                    {i.title}
                  </div>
                  <div className="flex min-w-0 items-center gap-2 text-small text-muted">
                    <span className="truncate">
                      {byline(i)}
                      {i.album && i.album !== i.title && !i.album.endsWith("(Single)") ? ` · ${i.album}` : ""}
                    </span>
                    {!i.exists && <Pill tone="warning">File missing</Pill>}
                  </div>
                </div>
              </div>
              <span className="truncate text-small text-muted max-lg:hidden">{formatLabel(i)}</span>
              <span className="text-right text-small text-muted tnum max-sm:hidden">{duration(i.duration)}</span>
              <span className="text-right text-small text-muted tnum max-lg:hidden">{i.exists ? bytes(i.file_size) : "–"}</span>
              <span className="text-right text-small text-faint tnum max-lg:hidden">{when(i.finished_at)}</span>
              <div className="flex justify-end">
                <SavedActions item={i} queue={queue} compact />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GridLayout({ rows, queue, square, playingId }: { rows: Item[]; queue: Item[]; square: boolean; playingId?: number }) {
  const { play } = useStore();
  return (
    <ul className={`grid gap-[14px] ${square ? "grid-cols-[repeat(auto-fill,minmax(176px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(232px,1fr))]"}`}>
      {rows.map((i) => (
        <li key={i.id} className="group flex flex-col">
          <button
            onClick={() => i.exists && play(i, queue)}
            disabled={!i.exists}
            aria-label={`Play ${i.title}`}
            className="relative overflow-hidden rounded-[14px]"
          >
            <Thumb
              src={i.thumb}
              kind={i.kind}
              fit={!square && i.kind === "audio" ? "contain" : "cover"}
              className={`w-full ${square ? "aspect-square" : "aspect-video"} transition-transform duration-300 group-hover:scale-[1.03] ${i.exists ? "" : "opacity-40"}`}
            />
            <span className="absolute right-2 bottom-2 rounded-md bg-black/80 px-1.5 py-0.5 text-small text-ink tnum">{duration(i.duration)}</span>
            {i.exists && (
              <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                <span className="flex size-11 items-center justify-center rounded-full bg-ink text-black">
                  <Play size={18} fill="currentColor" />
                </span>
              </span>
            )}
          </button>
          <div className="mt-2.5 flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <div className={`line-clamp-2 text-body font-medium leading-snug ${i.id === playingId ? "text-accent" : i.exists ? "text-ink" : "text-faint"}`} title={i.title}>
                {i.title}
              </div>
              <div className="mt-0.5 truncate text-small text-muted">
                {byline(i)} · {i.container.toUpperCase()}
              </div>
              {!i.exists && (
                <div className="mt-1">
                  <Pill tone="warning">File missing</Pill>
                </div>
              )}
            </div>
            <div className="-mr-1 opacity-60 transition-opacity group-hover:opacity-100">
              <SavedActions item={i} queue={queue} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

