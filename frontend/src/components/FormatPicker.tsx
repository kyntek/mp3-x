import { ChevronDown } from "lucide-react";
import { api, type FormatSpec } from "../api";
import { qualityLabel } from "../format";
import { useStore } from "../store";
import { MenuItem, Popover } from "./ui";

export interface Choice {
  format: string;
  quality: string;
}

const MAIN = ["mp3", "mp4"];
const VIDEO = ["mp4", "webm", "mkv"];

function allSpecs(audio: FormatSpec[], video: FormatSpec[]) {
  return [...audio, ...video];
}

/** The current format + quality. It is the saved default, so the app reopens on the last choice. */
export function useChoice(): [Choice, (c: Choice) => void] {
  const { settings, setSettings, toast } = useStore();
  const choice: Choice = settings
    ? {
        format: settings.default_format,
        quality: VIDEO.includes(settings.default_format) ? settings.default_video_quality : settings.default_audio_quality,
      }
    : { format: "mp3", quality: "320" };
  const set = (c: Choice) => {
    if (!settings) return;
    const patch = {
      default_format: c.format,
      [VIDEO.includes(c.format) ? "default_video_quality" : "default_audio_quality"]: c.quality,
    };
    setSettings({ ...settings, ...patch });
    api.saveSettings(patch).catch((e: Error) => toast({ tone: "error", text: e.message }));
  };
  return [choice, set];
}

export function FormatPicker({
  value,
  onChange,
  heights,
}: {
  value: Choice;
  onChange: (c: Choice) => void;
  /** When known (a single probed video), only offer resolutions it really has. */
  heights?: number[];
}) {
  const { system } = useStore();
  const audio = system?.formats.audio ?? [];
  const video = system?.formats.video ?? [];
  const specs = allSpecs(audio, video);
  const spec = specs.find((s) => s.id === value.format);
  const other = !MAIN.includes(value.format) ? spec : undefined;

  const pick = (id: string) => {
    const s = specs.find((x) => x.id === id);
    if (!s) return;
    // Keep the quality when it still applies (e.g. 1080 from MP4 to MKV).
    onChange({ format: id, quality: s.qualities.includes(value.quality) ? value.quality : s.default });
  };

  let qualities = spec?.qualities ?? [];
  if (heights?.length && video.some((v) => v.id === value.format)) {
    const max = Math.max(...heights);
    qualities = qualities.filter((q) => q === "best" || Number(q) <= max);
  }

  const seg = (active: boolean) =>
    `h-8 rounded-full px-3.5 max-sm:px-3 text-body font-medium transition-colors ${active ? "bg-ink text-black" : "text-muted hover:text-ink"}`;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-full bg-raised p-0.5" role="radiogroup" aria-label="Format">
        {MAIN.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={value.format === id} className={seg(value.format === id)} onClick={() => pick(id)}>
            {id.toUpperCase()}
          </button>
        ))}
        <Popover
          width={260}
          trigger={(_, toggle) => (
            <button type="button" className={`${seg(!!other)} inline-flex items-center gap-1`} onClick={toggle} aria-haspopup="menu">
              {other ? other.label : "More"}
              <ChevronDown size={14} />
            </button>
          )}
        >
          {(close) => (
            <div>
              <div className="px-3 pt-2 pb-1 text-small text-faint">Audio</div>
              {audio.map((s) => (
                <MenuItem key={s.id} selected={value.format === s.id} onClick={() => (pick(s.id), close())} hint={describe(s.id)}>
                  {s.label}
                </MenuItem>
              ))}
              <div className="px-3 pt-3 pb-1 text-small text-faint">Video</div>
              {video.map((s) => (
                <MenuItem key={s.id} selected={value.format === s.id} onClick={() => (pick(s.id), close())} hint={describe(s.id)}>
                  {s.label}
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>
      </div>

      {qualities.length > 1 ? (
        <Popover
          width={200}
          align="right"
          trigger={(_, toggle) => (
            <button
              type="button"
              onClick={toggle}
              aria-haspopup="menu"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-raised px-3.5 text-body font-medium text-ink transition-colors hover:bg-nested tnum"
            >
              {qualityLabel(value.format, value.quality)}
              <ChevronDown size={14} className="text-faint" />
            </button>
          )}
        >
          {(close) =>
            qualities.map((q) => (
              <MenuItem key={q} selected={q === value.quality} onClick={() => (onChange({ ...value, quality: q }), close())}>
                <span className="tnum">{qualityLabel(value.format, q)}</span>
              </MenuItem>
            ))
          }
        </Popover>
      ) : (
        <span className="inline-flex h-9 items-center px-1 text-body text-faint">{qualityLabel(value.format, qualities[0] ?? "best")}</span>
      )}
    </div>
  );
}

function describe(id: string): string {
  return (
    {
      mp3: "Plays everywhere",
      m4a: "AAC, no re-encode",
      opus: "Smallest",
      flac: "Lossless container",
      wav: "Uncompressed",
      mp4: "H.264, plays everywhere",
      webm: "VP9 / AV1",
      mkv: "Any codec",
    }[id] ?? ""
  );
}
