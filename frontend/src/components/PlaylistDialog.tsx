import { Check, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type PlaylistProbe } from "../api";
import { duration } from "../format";
import { useStore } from "../store";
import { FormatPicker, type Choice } from "./FormatPicker";
import { Button, IconButton, Thumb } from "./ui";

export function PlaylistDialog({
  probe,
  choice,
  onChoice,
  onClose,
  onDone,
}: {
  probe: PlaylistProbe;
  choice: Choice;
  onChoice: (c: Choice) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useStore();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(probe.entries.map((_, i) => i)));
  const [folder, setFolder] = useState(true);
  const [sending, setSending] = useState(false);
  const kind = ["mp4", "webm", "mkv"].includes(choice.format) ? "video" : "audio";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = useMemo(
    () => probe.entries.reduce((s, e, i) => s + (selected.has(i) ? e.duration ?? 0 : 0), 0),
    [probe, selected],
  );
  const all = selected.size === probe.entries.length;

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const start = async () => {
    setSending(true);
    try {
      const entries = probe.entries.filter((_, i) => selected.has(i)).map((e) => ({ ...e, source: probe.source }));
      await api.enqueue(entries, choice.format, choice.quality, folder ? probe.title : null);
      onDone();
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="pl-title" className="pop-in flex max-h-[min(760px,100%)] w-full max-w-[760px] flex-col rounded-card bg-surface">
        <header className="flex items-start gap-4 p-[22px] pb-4">
          <Thumb src={probe.thumbnail} kind={kind} className="aspect-video w-[120px] rounded-tile" />
          <div className="min-w-0 flex-1">
            <h2 id="pl-title" className="truncate text-title font-semibold">{probe.title}</h2>
            <p className="mt-0.5 text-body text-muted tnum">
              {[probe.uploader, probe.source, `${probe.entries.length} items`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>

        <div className="flex items-center justify-between gap-3 px-[22px] pb-3">
          <button
            onClick={() => setSelected(all ? new Set() : new Set(probe.entries.map((_, i) => i)))}
            className="inline-flex h-8 items-center gap-2.5 rounded-full pr-3 text-body text-muted hover:text-ink"
          >
            <Box checked={all} partial={!all && selected.size > 0} />
            {all ? "Deselect all" : "Select all"}
          </button>
          <button onClick={() => setFolder((f) => !f)} className="inline-flex h-8 min-w-0 items-center gap-2.5 text-body text-muted hover:text-ink" title={probe.title}>
            <Box checked={folder} />
            <span className="truncate">Keep together in a playlist folder</span>
          </button>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto px-2.5">
          {probe.entries.map((e, i) => (
            <li key={`${e.url}-${i}`}>
              <button
                onClick={() => toggle(i)}
                className={`flex w-full items-center gap-3 rounded-tile px-3 py-2 text-left transition-colors hover:bg-raised ${selected.has(i) ? "" : "opacity-50"}`}
              >
                <Box checked={selected.has(i)} />
                <span className="w-6 shrink-0 text-right text-small text-faint tnum">{i + 1}</span>
                <Thumb src={e.thumbnail ?? null} kind={kind} className="aspect-video w-[72px] rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-ink">{e.title}</span>
                  <span className="block truncate text-small text-faint">{e.uploader ?? probe.uploader ?? "–"}</span>
                </span>
                <span className="shrink-0 text-small text-faint tnum">{duration(e.duration)}</span>
              </button>
            </li>
          ))}
        </ul>

        <footer className="flex flex-wrap items-center gap-3 border-t border-rule p-[22px] pt-4">
          <FormatPicker value={choice} onChange={onChoice} />
          <div className="flex-1" />
          <span className="text-body text-faint tnum">
            {selected.size} selected · {duration(total)}
          </span>
          <Button variant="primary" disabled={!selected.size || sending} onClick={start}>
            Download {selected.size} {selected.size === 1 ? "item" : "items"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Box({ checked, partial }: { checked: boolean; partial?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-[18px] shrink-0 items-center justify-center rounded-[6px] transition-colors ${checked || partial ? "bg-ink text-black" : "bg-nested"}`}
    >
      {checked ? <Check size={13} strokeWidth={3} /> : partial ? <span className="h-0.5 w-2 rounded bg-black" /> : null}
    </span>
  );
}
