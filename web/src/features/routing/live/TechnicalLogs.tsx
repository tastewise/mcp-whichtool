import { memo, useMemo, useState } from "react";
import LogBox, { entryRows } from "@/components/log/LogBox";
import { taskKey, useTaskOutput } from "@/features/activity/useTaskOutput";
import { useLogsStore } from "@/stores/logs.store";
import { useRoutingStore } from "@/stores/routing.store";
import { ROUTING_TASK } from "../run/models";

const NO_LINES: never[] = [];

// routing-page.js watchOutput: the eval's own stdout, ROUTING_EVENT lines consumed by the live block.
function TechnicalLogs({ running }: { running: boolean }) {
  const consumeLine = useRoutingStore((s) => s.consumeLine);
  const technicalOpens = useRoutingStore((s) => s.live.technicalOpens);
  useTaskOutput(ROUTING_TASK, running, consumeLine);
  const lines = useLogsStore((s) => s.buffers[taskKey(ROUTING_TASK)]) ?? NO_LINES;
  const rows = useMemo(() => entryRows(lines, true), [lines]);
  const [open, setOpen] = useState(false);
  const [seenOpens, setSeenOpens] = useState(technicalOpens);
  // Said once: a failed run opens the logs, and the reader may fold them again.
  if (technicalOpens !== seenOpens) { setSeenOpens(technicalOpens); if (technicalOpens) setOpen(true); }
  return (
    <details className="technical-output" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Technical logs</summary>
      <LogBox paneId="routing-output" placeholder="Search the run output" rows={rows} />
    </details>
  );
}

export default memo(TechnicalLogs);
