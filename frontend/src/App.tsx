import { ArrowDownToLine, Film, Library, Music2, Settings as SettingsIcon, X } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "./api";
import { DownloadsView } from "./components/DownloadsView";
import { LibraryView } from "./components/LibraryView";
import { LinkBar } from "./components/LinkBar";
import { Player } from "./components/Player";
import { SettingsView } from "./components/SettingsView";
import { useStore, type View } from "./store";

function Mark() {
  return (
    <svg viewBox="0 0 64 64" className="size-7 shrink-0" aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--color-accent)" />
      <path d="M32 14v24M21 28l11 11 11-11" fill="none" stroke="#000" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 48h28" stroke="#000" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const { view, setView, items, connected, playing, system } = useStore();
  const active = items.filter((i) => ["queued", "downloading", "processing"].includes(i.status)).length;
  const library = items.filter((i) => i.status === "done").length;

  const nav: { id: View; label: string; icon: ReactNode; count?: number }[] = [
    { id: "downloads", label: "Downloads", icon: <ArrowDownToLine size={16} />, count: active || undefined },
    { id: "library", label: "Library", icon: <Library size={16} />, count: library || undefined },
    { id: "settings", label: "Settings", icon: <SettingsIcon size={16} /> },
  ];

  return (
    <div className="grid h-full grid-cols-[220px_minmax(0,1fr)] grid-rows-[64px_minmax(0,1fr)_auto] max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)_auto_56px]">
      {/* Sidebar */}
      <aside className="row-span-3 flex flex-col border-r border-rule max-md:hidden">
        <div className="flex h-16 items-center gap-2.5 border-b border-rule px-5">
          <Mark />
          <span className="text-section font-semibold">mp3-x</span>
        </div>
        <nav className="flex flex-col gap-0.5 p-3" aria-label="Main">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              aria-current={view === n.id ? "page" : undefined}
              className={`flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-body transition-colors hover:text-ink ${view === n.id ? "font-medium text-ink" : "text-[#bbb]"}`}
            >
              <span className={view === n.id ? "text-ink" : "text-faint"}>{n.icon}</span>
              <span className="flex-1 text-left">{n.label}</span>
              {n.count !== undefined && <span className="text-small text-faint tnum">{n.count}</span>}
            </button>
          ))}
        </nav>

        <div className="mt-4 px-3">
          <div className="px-2.5 pb-1.5 text-small text-faint">Folders</div>
          <button onClick={() => api.openFolder("audio")} className="flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-body text-[#bbb] transition-colors hover:text-ink">
            <Music2 size={16} className="text-faint" /> Music
          </button>
          <button onClick={() => api.openFolder("video")} className="flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-body text-[#bbb] transition-colors hover:text-ink">
            <Film size={16} className="text-faint" /> Videos
          </button>
        </div>

        <div className="mt-auto flex items-center gap-2 px-5 py-4 text-small text-faint">
          <span className={`size-1.5 rounded-full ${connected ? "bg-ink" : "bg-negative"}`} />
          <span className="truncate tnum">{connected ? (system ? `yt-dlp ${system.yt_dlp}` : "Connected") : "Reconnecting…"}</span>
        </div>
      </aside>

      {/* Top bar: the link bar is the app's main job, always one paste away. */}
      <header className="flex items-center gap-3 border-b border-rule px-[29px] max-md:flex-wrap max-md:px-4 max-md:py-3">
        <div className="hidden items-center gap-2 max-md:flex max-md:w-full">
          <Mark />
          <span className="text-section font-semibold">mp3-x</span>
        </div>
        <LinkBar />
      </header>

      <main className="overflow-y-auto">
        {view === "downloads" && <DownloadsView />}
        {view === "library" && <LibraryView />}
        {view === "settings" && <SettingsView />}
      </main>

      <div className={playing?.kind === "audio" ? "" : "contents"}>
        <Player />
      </div>

      {/* Phone navigation */}
      <nav className="hidden border-t border-rule max-md:grid max-md:grid-cols-3" aria-label="Main">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center justify-center gap-0.5 text-small ${view === n.id ? "text-ink" : "text-faint"}`}>
            {n.icon}
            {n.label}
          </button>
        ))}
      </nav>

      <Toasts />
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="pointer-events-none fixed right-6 bottom-24 z-[60] flex w-[380px] max-w-[calc(100vw-32px)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pop-in pointer-events-auto flex items-start gap-3 rounded-2xl bg-raised p-3.5 pl-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)]">
          {t.tone === "error" && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-negative" />}
          <p className="min-w-0 flex-1 text-body text-ink">{t.text}</p>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
              className="shrink-0 rounded-full bg-ink px-3 py-1 text-small font-medium text-black hover:bg-[#e6e6e6]"
            >
              {t.action.label}
            </button>
          )}
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="shrink-0 text-faint hover:text-ink">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
