import type { LogEntry } from "@/api/types/log";
// What row.textContent was for logsearch.js: time, level and message glued together.
export function rowText(entry: LogEntry, plain: boolean): string {
  if (plain) return entry.line;
  return (entry.ts || "") + (entry.level || "") + (entry.text ?? entry.line);
}
