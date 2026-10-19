import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { LogEntry } from "@/api/types/log";
import { Input, JumpToLatest, LogBar, LogCount, LogEmpty, LogPane, LogRow, TaskLogRow } from "@/components/_ui";
import { rowText } from "./log-text";

export interface LogBoxRow { key: string | number; text: string; render: (hidden: boolean) => ReactNode }

// Log entries as rows: console.js logRow(), or the plain full-width task line.
export function entryRows(entries: LogEntry[], plain = false): LogBoxRow[] {
  return entries.map((entry, index) => ({
    key: index,
    text: rowText(entry, plain),
    render: (hidden) => (plain ? <TaskLogRow key={index} entry={entry} hidden={hidden} /> : <LogRow key={index} entry={entry} hidden={hidden} />),
  }));
}

interface Props {
  paneId: string; placeholder: string; rows: LogBoxRow[]; tabs?: ReactNode; empty?: string;
  // 48 for a stream that appends (activity.js), 40 for a pane rewritten whole (desktop.js).
  threshold?: number;
}

// logsearch.js attachLogSearch + the log pane it watches, as one component.
function LogBox({ paneId, placeholder, rows, tabs, empty, threshold = 48 }: Props) {
  const [needle, setNeedle] = useState("");
  const pane = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  // Scrolled up: the rows there were when it left the bottom, so the button can say how many came since.
  const [leftAt, setLeftAt] = useState<number | null>(null);
  // While the smooth jump runs, its own scroll events are not the reader leaving the bottom.
  const jumping = useRef(false);

  useLayoutEffect(() => {
    const node = pane.current;
    if (node && atBottom.current) node.scrollTop = node.scrollHeight;
  }, [rows]);

  // A pane filled while its tab was hidden had no height to scroll: once it gets one, it starts at the bottom too.
  useEffect(() => {
    const node = pane.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { if (atBottom.current) node.scrollTop = node.scrollHeight; });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const jump = () => {
    const node = pane.current;
    if (!node) return;
    atBottom.current = true;
    jumping.current = true;
    setLeftAt(null);
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  };

  const wanted = needle.trim().toLowerCase();
  let shown = 0;
  const rendered = rows.map((row) => {
    const hit = !wanted || row.text.toLowerCase().includes(wanted);
    if (hit) shown += 1;
    return row.render(!hit);
  });
  const count = !wanted ? "" : shown ? `${shown} of ${rows.length}` : `nothing matches in ${rows.length}`;

  return (
    <>
      <LogBar>
        {tabs}
        <Input variant="logsearch" id={paneId + "-search"} type="search" spellCheck={false} placeholder={placeholder} aria-label={placeholder}
          value={needle} onChange={(event) => setNeedle(event.target.value)} onKeyDown={(event) => event.stopPropagation()} />
        <LogCount id={paneId + "-count"}>{count}</LogCount>
      </LogBar>
      <div className="logwrap">
        <LogPane id={paneId} ref={pane} onScroll={(event) => {
          const node = event.currentTarget;
          const bottom = node.scrollHeight - node.scrollTop - node.clientHeight < threshold;
          if (jumping.current) { if (bottom) jumping.current = false; return; }
          atBottom.current = bottom;
          if (bottom) setLeftAt(null);
          else setLeftAt((was) => was ?? rows.length);
        }}>
          {rows.length ? rendered : empty ? <LogEmpty>{empty}</LogEmpty> : null}
        </LogPane>
        {leftAt !== null ? <JumpToLatest id={paneId + "-jump"} fresh={Math.max(0, rows.length - leftAt)} onJump={jump} /> : null}
      </div>
    </>
  );
}

export default memo(LogBox);
