import { FolderOpen, Minus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, type Settings } from "../api";
import { useStore } from "../store";
import { FormatPicker, useChoice } from "./FormatPicker";
import { Button, IconButton, Toggle } from "./ui";

export function SettingsView() {
  const { settings, setSettings, system, refreshSystem, toast } = useStore();
  const [choice, setChoice] = useChoice();
  if (!settings) return null;

  const save = async (patch: Partial<Settings>) => {
    const prev = settings;
    setSettings({ ...settings, ...patch });
    try {
      setSettings(await api.saveSettings(patch));
    } catch (e) {
      setSettings(prev);
      toast({ tone: "error", text: (e as Error).message });
    }
  };

  const browse = async (key: "audio_dir" | "video_dir" | "cookies_file", kind: "folder" | "file") => {
    try {
      const { path } = await api.pick(kind, kind === "folder" ? settings[key] : "");
      if (path) save({ [key]: path });
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[29px] pt-7 pb-16 max-sm:px-4">
      <h1 className="text-title font-semibold">Settings</h1>
      <p className="mt-1 text-body text-muted">Changes are saved as you make them.</p>

      <div className="mt-6 flex flex-col">
        <Section title="Where files go" description="Music and videos are kept in separate folders. Playlists get a subfolder of their own.">
          <PathField label="Music" value={settings.audio_dir} onBrowse={() => browse("audio_dir", "folder")} onOpen={() => api.openFolder("audio")} onSave={(v) => save({ audio_dir: v })} />
          <PathField label="Videos" value={settings.video_dir} onBrowse={() => browse("video_dir", "folder")} onOpen={() => api.openFolder("video")} onSave={(v) => save({ video_dir: v })} />
        </Section>

        <Section title="Format" description="What the Download button uses. It's the same picker as in the top bar, so your last choice sticks.">
          <FormatPicker value={choice} onChange={setChoice} />
        </Section>

        <Section
          title="Music tags"
          description="Save the metadata and artwork supplied by the source. Missing album or artist details are not looked up or guessed."
        >
          <SwitchRow
            title="Embed music tags and artwork"
            detail="Available title, artist, album and date; source artwork for MP3, M4A, Opus and FLAC. WAV gets text tags only."
            checked={settings.smart_tags}
            onChange={(v) => save({ smart_tags: v })}
          />
          <SwitchRow
            title="Name files “Artist - Title”"
            detail="Uses embedded tags. When artist metadata is missing, the source uploader may be used."
            checked={settings.rename_with_tags}
            disabled={!settings.smart_tags}
            onChange={(v) => save({ rename_with_tags: v })}
          />
        </Section>

        <Section title="Video" description="Applies to MP4, WebM and MKV.">
          <SwitchRow
            title="Prefer H.264 in MP4"
            detail="Plays on every TV, phone and editor. Above 1080p YouTube only offers VP9 or AV1, which are used instead."
            checked={settings.prefer_h264}
            onChange={(v) => save({ prefer_h264: v })}
          />
          <SwitchRow
            title="Embed English subtitles"
            detail="When the video has them. Not available for WebM."
            checked={settings.embed_subtitles}
            onChange={(v) => save({ embed_subtitles: v })}
          />
        </Section>

        <Section title="Queue" description="How many downloads run side by side. More than 3 rarely gets faster and may get rate-limited.">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-body font-medium">Downloads at once</div>
              <div className="text-body text-faint">Between 1 and 8</div>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-raised p-0.5">
              <IconButton label="Fewer" onClick={() => save({ max_concurrent: settings.max_concurrent - 1 })} disabled={settings.max_concurrent <= 1}>
                <Minus size={15} />
              </IconButton>
              <span className="w-6 text-center text-section font-semibold tnum">{settings.max_concurrent}</span>
              <IconButton label="More" onClick={() => save({ max_concurrent: settings.max_concurrent + 1 })} disabled={settings.max_concurrent >= 8}>
                <Plus size={15} />
              </IconButton>
            </div>
          </div>
        </Section>

        <Section
          title="Signed-in downloads"
          description="A cookies.txt exported from your browser unlocks age-restricted videos, private playlists and, with YouTube Premium, higher-bitrate audio."
        >
          <PathField
            label="Cookies file"
            placeholder="Not set"
            value={settings.cookies_file}
            onBrowse={() => browse("cookies_file", "file")}
            onSave={(v) => save({ cookies_file: v })}
            clearable
          />
        </Section>

        <Section title="Engine" description="yt-dlp downloads media and supplies metadata; FFmpeg converts, merges and writes tags." last>
          <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-body">
            <dt className="text-faint">yt-dlp</dt>
            <dd className="tnum">{system?.yt_dlp ?? "–"}</dd>
            <dt className="text-faint">FFmpeg</dt>
            <dd className={system && !system.ffmpeg ? "text-negative" : "tnum"}>{system ? system.ffmpeg ?? "Not found — set its folder below" : "–"}</dd>
            <dt className="text-faint">JavaScript runtime</dt>
            <dd className={system && !system.js_runtime ? "text-warning" : ""}>
              {system ? system.js_runtime ?? "None found. Install Deno or Node.js if YouTube downloads fail." : "–"}
            </dd>
            <dt className="text-faint">App data</dt>
            <dd className="truncate" title={system?.data_dir}>
              {system?.data_dir ?? "–"}
            </dd>
          </dl>
          <div>
            <PathField
              label="FFmpeg location"
              placeholder="Found automatically on PATH"
              value={settings.ffmpeg_location}
              onSave={(v) => save({ ffmpeg_location: v }).then(refreshSystem)}
              clearable
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, description, children, last }: { title: string; description: string; children: ReactNode; last?: boolean }) {
  return (
    <section className={`grid grid-cols-[minmax(0,1fr)] gap-4 py-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:gap-10 ${last ? "" : "border-b border-rule"}`}>
      <div className="md:pt-4">
        <h2 className="text-section font-medium">{title}</h2>
        <p className="mt-1 max-w-[42ch] text-body text-muted">{description}</p>
      </div>
      <div className="flex flex-col gap-5 rounded-2xl bg-surface p-5">{children}</div>
    </section>
  );
}

function SwitchRow({ title, detail, checked, onChange, disabled }: { title: string; detail: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-6 ${disabled ? "opacity-40" : ""}`}>
      <div>
        <div className="text-body font-medium">{title}</div>
        <div className="text-body text-faint">{detail}</div>
      </div>
      <div className="pt-0.5">
        <Toggle checked={checked} onChange={(v) => !disabled && onChange(v)} label={title} />
      </div>
    </div>
  );
}

function PathField({
  label,
  value,
  onSave,
  onBrowse,
  onOpen,
  placeholder,
  clearable,
}: {
  label: string;
  value: string;
  onSave: (v: string) => unknown;
  onBrowse?: () => void;
  onOpen?: () => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null && draft !== value) onSave(draft);
    setDraft(null);
  };
  return (
    <div>
      <label className="mb-2 block text-body font-medium" htmlFor={`f-${label}`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`f-${label}`}
          value={shown}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-control bg-ground px-3 text-body outline-none transition-colors placeholder:text-faint focus:border-ink"
        />
        {onBrowse && <Button onClick={onBrowse} className="max-sm:px-3">Browse…</Button>}
        {clearable && value && <Button variant="ghost" onClick={() => onSave("")}>Clear</Button>}
        {onOpen && (
          <IconButton label={`Open ${label.toLowerCase()} folder`} onClick={onOpen}>
            <FolderOpen size={16} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

