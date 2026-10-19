import { memo } from "react";

export type CaseSummaryProps = { id: string; passed: boolean; hits: number; samples: number };

// routing-live.js / routing-page.js: the summary line of a live or historical case.
function CaseSummary({ id, passed, hits, samples }: CaseSummaryProps) {
  return (
    <summary>
      <span className="live-icon" aria-label={passed ? "Passed" : "Failed"}>{passed ? "✓" : "✕"}</span>
      <span>{id}</span>
      <span className="live-votes">{`${hits}/${samples}`}</span>
    </summary>
  );
}

export default memo(CaseSummary);
