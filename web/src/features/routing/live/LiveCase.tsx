import { memo } from "react";
import type { RunCase } from "@/api/types/routing";
import { CaseSummary, ToolLine } from "@/components/_ui";

// routing-live.js: one details per completed case, newest first; "Selected" for live, "Draws" in a report.
function LiveCase({ row, samples, picksLabel = "Selected", className = "live-case", children }: { row: RunCase; samples: number; picksLabel?: string; className?: string; children?: React.ReactNode }) {
  return (
    <details className={className + (row.passed ? "" : " failed")}>
      <CaseSummary id={row.id} passed={row.passed} hits={row.hits} samples={samples} />
      <p>{row.prompt}</p>
      <ToolLine label="Expected" names={[row.expect]} />
      <ToolLine label={picksLabel} names={row.picks} />
      {children}
    </details>
  );
}

export default memo(LiveCase);
