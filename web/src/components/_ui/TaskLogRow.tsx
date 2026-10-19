import { memo, type CSSProperties } from "react";
import type { LogEntry } from "@/api/types/log";

const FULL_WIDTH: CSSProperties = { gridColumn: "1 / -1" };

export type TaskLogRowProps = { entry: LogEntry; hidden?: boolean };

// A line of a task's output: one plain cell across the grid.
function TaskLogRow({ entry, hidden }: TaskLogRowProps) {
  return <div className="logrow plain" hidden={hidden}><span className="lm" style={FULL_WIDTH}>{entry.line}</span></div>;
}

export default memo(TaskLogRow);
