import { ArrowDown, ClipboardPaste, Link2, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PlaylistProbe } from "../api";
import { useStore } from "../store";
import { FormatPicker, useChoice } from "./FormatPicker";
import { PlaylistDialog } from "./PlaylistDialog";
import { Button, IconButton } from "./ui";

const looksLikeUrl = (s: string) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(s.trim());

/** The top bar: paste a link, pick a format, download. Ctrl+V anywhere in the app lands here. */
export function LinkBar() {
  const { toast, setView } = useStore();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useChoice();
  const [playlist, setPlaylist] = useState<PlaylistProbe | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const openPlaylist = useCallback(
    async (link: string) => {
      setBusy(true);
      try {
        const p = await api.probe(link, true);
        if (p.type === "playlist") setPlaylist(p);
      } catch (e) {
        toast({ tone: "error", text: (e as Error).message });
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const submit = useCallback(
    async (raw?: string) => {
      const link = (raw ?? url).trim();
      if (!link || busy) return;
      if (!looksLikeUrl(link)) {
        toast({ tone: "error", text: "That doesn't look like a link. Paste a YouTube, YouTube Music or SoundCloud URL." });
        return;
      }
      setBusy(true);
      try {
        const p = await api.probe(link);
        if (p.type === "playlist") {
          setPlaylist(p);
        } else {
          await api.enqueue([p], choice.format, choice.quality);
          setUrl("");
          setView("downloads");
          if (p.in_playlist) {
            toast({
              text: "This video is part of a playlist.",
              action: { label: "Pick from playlist", run: () => openPlaylist(link) },
            });
          }
        }
      } catch (e) {
        toast({ tone: "error", text: (e as Error).message });
      } finally {
        setBusy(false);
      }
    },
    [url, busy, choice, toast, setView, openPlaylist],
  );

  // Paste a link anywhere (outside a text field) and it starts right away.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      const text = e.clipboardData?.getData("text")?.trim() ?? "";
      if (looksLikeUrl(text)) {
        e.preventDefault();
        setUrl(text);
        submit(text);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [submit]);

  const pasteFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setUrl(text);
        input.current?.focus();
        if (looksLikeUrl(text)) submit(text);
      }
    } catch {
      input.current?.focus();
      toast({ text: "Clipboard access was blocked. Press Ctrl+V in the link field instead." });
    }
  };

  return (
    <>
      <form
        className="flex min-w-0 flex-1 items-center gap-3 max-md:flex-wrap max-md:gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="group flex h-11 min-w-0 flex-1 items-center max-md:basis-full gap-2.5 rounded-full bg-surface pr-1.5 pl-4 transition-colors focus-within:bg-raised hover:bg-raised max-sm:basis-[calc(100%-3.25rem)]">
          {busy ? <Loader2 size={16} className="shrink-0 animate-spin text-ink" /> : <Link2 size={16} className="shrink-0 text-faint" />}
          <input
            ref={input}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text").trim();
              if (looksLikeUrl(text) && !url) {
                e.preventDefault();
                setUrl(text);
                submit(text);
              }
            }}
            placeholder={busy ? "Looking up the link…" : "Paste a link from YouTube, YouTube Music or SoundCloud"}
            spellCheck={false}
            disabled={busy}
            className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-faint disabled:opacity-60"
            aria-label="Link to download"
          />
          {url && !busy ? (
            <IconButton label="Clear" type="button" onClick={() => setUrl("")}>
              <X size={16} />
            </IconButton>
          ) : (
            <IconButton label="Paste from clipboard" type="button" onClick={pasteFromClipboard} disabled={busy}>
              <ClipboardPaste size={16} />
            </IconButton>
          )}
        </label>
        <div className="contents max-sm:order-3 max-sm:flex">
          <FormatPicker value={choice} onChange={setChoice} />
        </div>
        <Button variant="primary" type="submit" disabled={busy || !url.trim()} className="max-md:ml-auto max-sm:ml-0 max-sm:w-11 max-sm:px-0">
          <ArrowDown size={16} strokeWidth={2.25} />
          <span className="max-sm:hidden">Download</span>
        </Button>
      </form>
      {playlist && (
        <PlaylistDialog
          probe={playlist}
          choice={choice}
          onChoice={setChoice}
          onClose={() => setPlaylist(null)}
          onDone={() => {
            setPlaylist(null);
            setUrl("");
            setView("downloads");
          }}
        />
      )}
    </>
  );
}
