import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { api, type Item, type Settings, type System } from "./api";

export type View = "downloads" | "library" | "settings";

export interface Toast {
  id: number;
  text: string;
  tone?: "error" | "info";
  action?: { label: string; run: () => void };
}

type ItemsAction = { type: "load"; items: Item[] } | { type: "item"; item: Item } | { type: "removed"; id: number };

function itemsReducer(state: Map<number, Item>, action: ItemsAction): Map<number, Item> {
  switch (action.type) {
    case "load":
      return new Map(action.items.map((i) => [i.id, i]));
    case "item": {
      const next = new Map(state);
      next.set(action.item.id, action.item);
      return next;
    }
    case "removed": {
      const next = new Map(state);
      next.delete(action.id);
      return next;
    }
  }
}

interface Store {
  items: Item[];
  connected: boolean;
  settings: Settings | null;
  system: System | null;
  setSettings: (s: Settings) => void;
  refreshSystem: () => void;
  view: View;
  setView: (v: View) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
  /** Current track/video in the player, and the list it was started from (for next/previous). */
  playing: Item | null;
  play: (item: Item, queue?: Item[]) => void;
  playQueue: Item[];
  stop: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [itemMap, dispatch] = useReducer(itemsReducer, new Map<number, Item>());
  const [connected, setConnected] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [system, setSystem] = useState<System | null>(null);
  const fromHash = (): View => {
    const h = location.hash.slice(1);
    return h === "library" || h === "settings" ? h : "downloads";
  };
  const [view, setViewState] = useState<View>(fromHash);
  const setView = useCallback((v: View) => {
    setViewState(v);
    if (fromHash() !== v) location.hash = v === "downloads" ? "" : v;
  }, []);
  useEffect(() => {
    const onHash = () => setViewState(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [playing, setPlaying] = useState<Item | null>(null);
  const [playQueue, setPlayQueue] = useState<Item[]>([]);
  const toastId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++toastId.current;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.action ? 9000 : 5000);
    },
    [dismiss],
  );

  const refreshSystem = useCallback(() => {
    api.system().then(setSystem).catch(() => {});
  }, []);
  useEffect(() => {
    api.settings().then(setSettings).catch(() => {});
    refreshSystem();
  }, [refreshSystem]);

  // Live queue: a full load, then server-sent events. Reload on every reconnect so nothing is missed.
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onopen = () => {
      setConnected(true);
      api.items().then((items) => dispatch({ type: "load", items })).catch(() => {});
    };
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "item") dispatch({ type: "item", item: data.item });
      else if (data.type === "removed") dispatch({ type: "removed", id: data.id });
    };
    return () => es.close();
  }, []);

  const items = useMemo(
    () => [...itemMap.values()].sort((a, b) => b.created_at - a.created_at || b.id - a.id),
    [itemMap],
  );

  // Keep the playing item fresh (e.g. if it gets deleted).
  useEffect(() => {
    if (playing && !itemMap.has(playing.id)) setPlaying(null);
  }, [itemMap, playing]);

  const play = useCallback((item: Item, queue?: Item[]) => {
    setPlaying(item);
    if (queue) setPlayQueue(queue);
  }, []);
  const stop = useCallback(() => setPlaying(null), []);

  const value: Store = {
    items, connected, settings, system, setSettings, refreshSystem, view, setView, toasts, toast, dismiss,
    playing, play, playQueue, stop,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
