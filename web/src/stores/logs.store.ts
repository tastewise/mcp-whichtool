import { create } from "zustand";
import type { LogEntry } from "@/api/types/log";

export const LOG_CAP = 600;

interface LogsState {
  buffers: Record<string, LogEntry[]>;
  conn: "ok" | "busy";
  push: (key: string, entry: LogEntry) => void;
  clear: (key: string) => void;
  setConn: (conn: "ok" | "busy") => void;
}

// Lines arrive faster than frames; one store write per frame, not one per line.
const pending = new Map<string, LogEntry[]>();
let scheduled = false;
const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (callback: () => void) => setTimeout(callback, 16);

export function flushLogs() {
  scheduled = false;
  if (!pending.size) return;
  const batch = new Map(pending);
  pending.clear();
  useLogsStore.setState((state) => {
    const buffers = { ...state.buffers };
    for (const [key, rows] of batch) {
      const merged = [...(buffers[key] ?? []), ...rows];
      buffers[key] = merged.length > LOG_CAP ? merged.slice(merged.length - LOG_CAP) : merged;
    }
    return { buffers };
  });
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  raf(flushLogs);
}

export const useLogsStore = create<LogsState>((set) => ({
  buffers: {},
  conn: "ok",
  push: (key, entry) => {
    const rows = pending.get(key) ?? [];
    rows.push(entry);
    pending.set(key, rows);
    schedule();
  },
  clear: (key) => {
    pending.delete(key);
    set((state) => ({ buffers: { ...state.buffers, [key]: [] } }));
  },
  setConn: (conn) => set({ conn }),
}));
