import { getRun } from "@/api/endpoints/routing";
import type { RunCase, RunDetail } from "@/api/types/routing";

// The run writes its JSON once, at the end; until then reading it 404s.
const POLL_MS = 2500;
const GIVE_UP_AFTER = 120;

export const runIdOf = (resultPath: string) => resultPath.split("/").pop() ?? resultPath;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function replayed(runId: string, caseId: string): Promise<{ row: RunCase; samples: number }> {
  for (let attempt = 0; attempt < GIVE_UP_AFTER; attempt += 1) {
    await wait(POLL_MS);
    try {
      const run = await getRun(runId);
      const row = run.cases.find((item) => item.id === caseId);
      if (row) return { row, samples: run.samples };
    } catch {
      // Not written yet, or the run is still going: ask again.
    }
  }
  throw new Error("The replay is taking longer than expected. Look at Runs.");
}

export async function finishedRun(runId: string): Promise<RunDetail> {
  for (let attempt = 0; attempt < GIVE_UP_AFTER; attempt += 1) {
    await wait(POLL_MS);
    try { return await getRun(runId); } catch { /* Not written yet: ask again. */ }
  }
  throw new Error("The run is taking longer than expected. Look at Runs.");
}

export function verdict(row: RunCase, samples: number, tool: string): string {
  if (row.passed) return `Passed ${row.hits}/${samples} — the router picks ${tool} now.`;
  const picked = [...new Set(row.picks.filter(Boolean))].join(", ");
  return `Still failing: ${row.hits}/${samples}${picked ? `, it picked ${picked}` : ""}.`;
}
