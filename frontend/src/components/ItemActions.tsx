import { Copy, ExternalLink, FolderOpen, MoreHorizontal, Play, RefreshCw, SquareArrowOutUpRight, Trash2, X } from "lucide-react";
import { api, type Item } from "../api";
import { useStore } from "../store";
import { IconButton, MenuItem, Popover } from "./ui";

/** Row actions for a saved file: play, show in folder, and the overflow menu. */
/** `compact` drops the Play button on phones, where the row's thumbnail already plays. */
export function SavedActions({ item, queue, compact }: { item: Item; queue: Item[]; compact?: boolean }) {
  const { play, toast } = useStore();
  const run = (p: Promise<unknown>) => p.catch((e: Error) => toast({ tone: "error", text: e.message }));

  const again = () =>
    run(
      api
        .enqueue([{ url: item.url, title: item.title, thumbnail: item.thumbnail_url, uploader: item.uploader }], item.container, item.quality)
        .then(() => toast({ text: `Downloading “${item.title}” again.` })),
    );

  return (
    <div className="flex items-center gap-0.5">
      {item.exists ? (
        <>
          <IconButton label="Play" onClick={() => play(item, queue)} className={compact ? "max-sm:hidden" : ""}>
            <Play size={16} />
          </IconButton>
          <IconButton label="Show in folder" onClick={() => run(api.open(item.id, true))}>
            <FolderOpen size={16} />
          </IconButton>
        </>
      ) : (
        <IconButton label="Download again" onClick={again}>
          <RefreshCw size={16} />
        </IconButton>
      )}
      <Popover
        align="right"
        width={248}
        trigger={(_, toggle) => (
          <IconButton label="More actions" onClick={toggle} aria-haspopup="menu">
            <MoreHorizontal size={16} />
          </IconButton>
        )}
      >
        {(close) => (
          <>
            {item.exists && (
              <MenuItem onClick={() => (run(api.open(item.id)), close())}>
                <SquareArrowOutUpRight size={15} /> Open with default app
              </MenuItem>
            )}
            <MenuItem onClick={() => (window.open(item.url, "_blank"), close())}>
              <ExternalLink size={15} /> Open source page
            </MenuItem>
            <MenuItem
              onClick={() => {
                navigator.clipboard.writeText(item.url).then(() => toast({ text: "Link copied." }));
                close();
              }}
            >
              <Copy size={15} /> Copy link
            </MenuItem>
            {item.exists && (
              <MenuItem onClick={() => (again(), close())}>
                <RefreshCw size={15} /> Download again
              </MenuItem>
            )}
            <div className="my-1 h-px bg-nested" />
            <MenuItem onClick={() => (run(api.remove(item.id)), close())}>
              <X size={15} /> Remove from library
            </MenuItem>
            {item.exists && (
              <MenuItem
                danger
                onClick={() => {
                  close();
                  if (confirm(`Delete “${item.title}” from disk? This can't be undone.`)) run(api.remove(item.id, true));
                }}
              >
                <Trash2 size={15} /> Delete file
              </MenuItem>
            )}
          </>
        )}
      </Popover>
    </div>
  );
}
