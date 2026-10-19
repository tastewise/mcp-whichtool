import { memo } from "react";
import type { TriedCase } from "@/api/types/routing";
import { MODEL_GROUPS } from "@/features/routing/run/models";

const LABELS = new Map<string, string>(MODEL_GROUPS.flatMap((g) => g.options.map(([id, label]) => [id, label] as [string, string])));

// Where a tried prompt went, the vote, and the model that routed it.
function TryLine({ verdict }: { verdict: TriedCase }) {
  const draws = verdict.picks.length;
  const hits = verdict.picks.filter((p) => p === verdict.expect).length;
  const counted = new Map<string, number>();
  for (const pick of verdict.picks) counted.set(pick ?? "no tool", (counted.get(pick ?? "no tool") ?? 0) + 1);
  const top = [...counted.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const by = verdict.model ? ` · ${LABELS.get(verdict.model) ?? verdict.model}` : "";
  const text = verdict.passed ? `routes to ${verdict.expect}` : `routes to ${top}, not ${verdict.expect}`;
  return (
    <p className={verdict.passed ? "try-verdict ok" : "try-verdict bad"}>
      <span className="try-result">{`${verdict.passed ? "✓" : "✗"} ${text} (${hits}/${draws})`}</span>
      {by ? <span className="try-model">{by}</span> : null}
    </p>
  );
}

// Each try of one prompt, one line each, in the order they ran.
function TryVerdict({ verdicts }: { verdicts: TriedCase[] | undefined }) {
  if (!verdicts?.length) return null;
  return <div className="try-verdicts">{verdicts.map((v, i) => <TryLine key={i} verdict={v} />)}</div>;
}

export default memo(TryVerdict);
