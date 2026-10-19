import { memo } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { LogEntry } from "@/api/types/log";

export const logRowVariants = cva("logrow", {
  variants: { tone: { plain: "plain", info: "info", warn: "warn", error: "error", debug: "debug", cont: "cont" } },
  defaultVariants: { tone: "plain" },
});

export type LogRowProps = VariantProps<typeof logRowVariants> & { entry: LogEntry; hidden?: boolean };

// console.js logRow(). Memoised: a stream re-renders the pane, never the rows already there.
function LogRow({ tone, entry, hidden }: LogRowProps) {
  const derived = entry.continuation ? "cont" : entry.level || "plain";
  return (
    <div className={"logrow " + (tone ?? derived)} title={entry.line} hidden={hidden}>
      <span className="lt">{entry.ts || ""}</span>
      <span className="lv">{entry.level || ""}</span>
      <span className="lm">{entry.text ?? entry.line}</span>
    </div>
  );
}

export default memo(LogRow);
