import { useEffect } from "react";
import { openStream } from "@/api/sse";
import { useDocumentVisible } from "@/lib/use-document-visible";
import { useLogsStore } from "@/stores/logs.store";

export const taskKey = (name: string) => "task:" + name;

// A task's output, streamed into the logs store. `keepHidden` holds the stream while a run is in flight.
export function useTaskOutput(name: string | null, keepHidden = false, onLine?: (line: string) => boolean) {
  const visible = useDocumentVisible();
  useEffect(() => {
    if (!name || (!visible && !keepHidden)) return;
    const { push, clear } = useLogsStore.getState();
    const key = taskKey(name);
    clear(key);
    return openStream("/api/tasks/" + encodeURIComponent(name) + "/output", {
      onEvent: (payload) => {
        if (payload.type !== "log") return;
        const line = payload.line as string;
        if (onLine && onLine(line)) return;
        push(key, { line });
      },
    });
  }, [name, visible, keepHidden, onLine]);
}
