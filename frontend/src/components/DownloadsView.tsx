import { ArrowRight, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { api, type Item } from "../api";
import { byline, bytes, duration, eta, formatLabel, when } from "../format";
import { useStore } from "../store";
import { SavedActions } from "./ItemActions";
import { Button, IconButton, Pill, Progress, Thumb } from "./ui";

const RECENT = 6;

export function DownloadsView() {
  const { items, toast, setView } = useStore();
  const running = items.filter((i) => i.status === "downloading" || i.status === "processing").reverse();
  const waiting = items.filter((i) => i.status === "queued").reverse();
  const failed = items.filter((i) => i.status === "error" || i.status === "canceled");
  const done = items.filter((i) => i.status === "done").sort((a, b) => (b.finished_at ?? 0) - (a.finished_at ?? 0));
  const run = (p: Promise<unknown>) => p.catch((e: Error) => toast({ tone: "error", text: e.message }));

  const speed = running.reduce((s, i) => s + (i.live?.speed ?? 0), 0);
  const today = done.filter((i) => (i.finished_at ?? 0) * 1000 > new Date().setHours(0, 0, 0, 0));

  const summary: string[] = [];
  if (running.length) summary.push(`${running.length} downloading${speed ? ` at ${bytes(speed)}/s` : ""}`);
  if (waiting.length) summary.push(`${waiting.length} waiting`);
  if (failed.length) summary.push(`${failed.length} need${failed.length === 1 ? "s" : ""} attention`);
  if (!running.length && !waiting.length)
    summary.push(today.length ? `All done. ${today.length} ${today.length === 1 ? "file" : "files"} saved today` : "Nothing downloading");

  if (!items.length) return <EmptyState />;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10 px-[29px] pt-7 pb-16 max-sm:px-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title font-semibold">Downloads</h1>
          <p className="mt-1 text-body text-muted tnum">{summary.join(" · ")}</p>
        </div>
        {(running.length > 0 || waiting.length > 0) && (
          <Button size="sm" variant="ghost" onClick={() => run(api.cancelAll())}>
            <X size={14} /> Cancel all
          </Button>
        )}
      </div>

      {running.length + waiting.length > 0 && (
        <Section title="In progress" count={running.length + waiting.length}>
          {[...running, ...waiting].map((i) => (
            <ActiveRow key={i.id} item={i} onCancel={() => run(api.cancel(i.id))} />
          ))}
        </Section>
      )}

      {failed.length > 0 && (
        <Section
          title="Needs attention"
          count={failed.length}
          action={
            <Button size="sm" variant="ghost" onClick={() => run(api.clear("failed"))}>
              Clear list
            </Button>
          }
        >
          {failed.map((i) => (
            <Row
              key={i.id}
              item={i}
              meta={
                i.status === "canceled" ? (
                  <span className="text-faint">Canceled</span>
                ) : (
                  <span className="text-negative" title={i.error ?? undefined}>
                    {i.error || "Failed"}
                  </span>
                )
              }
              actions={
                <>
                  <Button size="sm" onClick={() => run(api.retry(i.id))} aria-label="Retry">
                    <RotateCcw size={14} /> <span className="max-sm:hidden">Retry</span>
                  </Button>
                  <IconButton label="Remove" onClick={() => run(api.remove(i.id))}>
                    <X size={16} />
                  </IconButton>
                </>
              }
            />
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section
          title="Finished"
          count={done.length}
          action={
            <Button size="sm" variant="ghost" onClick={() => setView("library")}>
              Open library <ArrowRight size={14} />
            </Button>
          }
        >
          {done.slice(0, RECENT).map((i) => (
            <Row
              key={i.id}
              item={i}
              meta={
                <span className="text-faint tnum">
                  {i.exists ? `${bytes(i.file_size)} · ${duration(i.duration)} · ${when(i.finished_at)}` : "File was moved or deleted"}
                </span>
              }
              actions={<SavedActions item={i} queue={done.filter((d) => d.exists)} />}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex h-8 items-center justify-between">
        <h2 className="text-section font-medium">
          {title} <span className="ml-1 text-faint tnum">{count}</span>
        </h2>
        {action}
      </div>
      <ul className="flex flex-col rounded-card bg-surface p-1.5">{children}</ul>
    </section>
  );
}

function Row({ item, meta, actions, children }: { item: Item; meta: ReactNode; actions: ReactNode; children?: ReactNode }) {
  return (
    <li className="row-in group flex min-h-[80px] items-center gap-4 rounded-[14px] px-3 py-2.5 transition-colors hover:bg-raised max-sm:gap-3 max-sm:px-2">
      <Thumb src={item.thumb} kind={item.kind} className="aspect-video w-[104px] rounded-tile max-sm:w-[72px]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-medium text-ink" title={item.title}>
          {item.title}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-small text-muted">
          <Pill>{formatLabel(item)}</Pill>
          <span className="truncate">
            {byline(item)}
            {item.playlist && <span className="text-faint"> · {item.playlist}</span>}
          </span>
        </div>
        {children ?? <div className="mt-1 truncate text-small">{meta}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </li>
  );
}

function ActiveRow({ item, onCancel }: { item: Item; onCancel: () => void }) {
  const live = item.live;
  const queued = item.status === "queued";
  const processing = item.status === "processing" || (live && live.stage !== "Downloading" && live.progress >= 1);
  const fetching = !queued && (!live || live.stage === "Starting" || live.stage === "Fetching info");
  const pct = Math.round((live?.progress ?? 0) * 100);

  let status: string;
  if (queued) status = "Waiting for a free slot";
  else if (fetching) status = "Fetching info";
  else if (processing) status = live?.stage ?? "Processing";
  else
    status = [
      live?.total ? `${bytes(live.downloaded)} of ${bytes(live.total)}` : bytes(live?.downloaded),
      live?.speed ? `${bytes(live.speed)}/s` : null,
      eta(live?.eta),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <Row
      item={item}
      meta={null}
      actions={
        <IconButton label={queued ? "Remove from queue" : "Cancel download"} onClick={onCancel}>
          <X size={16} />
        </IconButton>
      }
    >
      <div className="mt-2 flex items-center gap-3">
        <Progress value={live?.progress ?? 0} indeterminate={!queued && (fetching || !!processing)} className={`flex-1 ${queued ? "opacity-40" : ""}`} />
        <span className="w-10 shrink-0 text-right text-small text-ink tnum">{queued || fetching || processing ? "" : `${pct}%`}</span>
      </div>
      <div className="mt-1 truncate text-small text-faint tnum">{status}</div>
    </Row>
  );
}

function EmptyState() {
  const { system } = useStore();
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10 px-[29px] pt-7 pb-16 max-sm:px-4">
      <div>
        <h1 className="text-title font-semibold">Downloads</h1>
        <p className="mt-1 text-body text-muted">Nothing downloaded yet</p>
      </div>
      <div className="grid gap-[14px] md:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col justify-between gap-10 rounded-card bg-surface p-[22px]">
          <div>
            <h2 className="text-kpi font-semibold leading-tight">Paste a link to start</h2>
            <p className="mt-2 max-w-[46ch] text-body text-muted">
              Drop a link into the bar above, or just press <Kbd>Ctrl</Kbd> <Kbd>V</Kbd> anywhere in the app. Choose MP3 for music, MP4 for video; every
              finished file lands in your library.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-body sm:grid-cols-3">
            <Fact term="Videos & shorts" detail="youtube.com, youtu.be" />
            <Fact term="Albums & songs" detail="music.youtube.com" />
            <Fact term="Tracks & sets" detail="soundcloud.com" />
          </dl>
        </div>
        <div className="flex flex-col gap-4 rounded-card bg-surface p-[22px]">
          <h2 className="text-section font-medium">What each format gives you</h2>
          <ul className="flex flex-col gap-3 text-body">
            <li>
              <span className="font-medium text-ink">MP3</span>
              <span className="text-muted"> — available title, artist, album and source artwork, embedded when music tags are enabled.</span>
            </li>
            <li>
              <span className="font-medium text-ink">MP4</span>
              <span className="text-muted"> — H.264 video up to the quality you pick, with chapters and thumbnail embedded.</span>
            </li>
            <li>
              <span className="font-medium text-ink">Playlists</span>
              <span className="text-muted"> — pick the items you want; they’re saved together in one folder.</span>
            </li>
          </ul>
          {system && (
            <p className="mt-auto text-small text-faint tnum">
              yt-dlp {system.yt_dlp} / {system.ffmpeg ? `FFmpeg ${system.ffmpeg.split("-")[0]}` : "FFmpeg not found"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-ink">{term}</dt>
      <dd className="text-small text-faint">{detail}</dd>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 items-center rounded-md bg-nested px-1.5 font-sans text-small text-ink">{children}</kbd>;
}
