import type { RoutingEvent, RunCase } from "@/api/types/routing";

// terminate() and kill() come back as these; anything else is the run falling over.
const STOPPED = [-15, -9, 143, 137];

export interface Live {
  runId: string | null; total: number; completed: number; samples: number;
  awaiting: boolean; awaitingSince: number; told: boolean;
  results: RunCase[];
  title: string; count: string; score: string; progress: number | null; failed: boolean;
  // Stopped on request: no report is written, so none is waited for.
  stopped: boolean;
  technicalOpens: number;
}

export const initialLive = (): Live => ({
  runId: null, total: 0, completed: 0, samples: 0, awaiting: false, awaitingSince: 0, told: false, results: [],
  title: "Ready to run", count: "0 prompts", score: "Results appear as each prompt completes.", progress: 0, failed: false, stopped: false, technicalOpens: 0,
});

export function resetProgress(live: Live): Live {
  return { ...live, runId: null, total: 0, completed: 0, awaiting: true, awaitingSince: Date.now() / 1000, told: false, results: [],
    failed: false, stopped: false, title: "Preparing evaluation…", count: "Waiting for prompts", progress: null, score: "Waiting for live results…" };
}

function settle(live: Live, exitCode: number | null | undefined): Live {
  if (exitCode === null || exitCode === undefined) return { ...live, title: "Evaluation ended" };
  const next = { ...live, progress: live.runId ? live.completed : 0 };
  const ok = exitCode === 0;
  const stopped = STOPPED.includes(exitCode);
  next.failed = !ok && !stopped;
  next.stopped = stopped;
  if (ok) { next.title = live.completed === live.total && live.total ? "Evaluation complete" : "Evaluation ended before completion"; return next; }
  next.title = stopped ? "Evaluation stopped" : "Evaluation failed";
  next.score = stopped ? "Stopped on request. Run it again when you are ready." : `The eval exited with code ${exitCode}, so nothing was scored. The technical logs below say why.`;
  if (live.told || stopped) return next;
  return { ...next, told: true, technicalOpens: live.technicalOpens + 1 };
}

export function updateProgressState(live: Live, running: boolean, exitCode: number | null | undefined, startedAt = 0): Live {
  if (running) {
    const since = Math.min(live.awaitingSince || startedAt, startedAt || live.awaitingSince);
    const next = { ...live, awaiting: true, awaitingSince: since, told: false, failed: false, stopped: false };
    if (!live.runId) return { ...next, title: "Evaluation running", score: "Waiting for live events. Runs started before this update only provide technical logs." };
    return { ...next, title: live.completed === live.total ? "Finalizing report…" : "Evaluating prompts…" };
  }
  if (!live.awaiting) return live;
  // A run asked for a second ago has not started yet: the code on screen is the last run's.
  if (startedAt && startedAt < live.awaitingSince - 1) return live;
  return settle(live, exitCode);
}

export function consumeProgress(live: Live, line: string): { live: Live; consumed: boolean } {
  const prefix = "ROUTING_EVENT ";
  const index = line.indexOf(prefix);
  if (index < 0) return { live, consumed: false };
  let event: RoutingEvent;
  try { event = JSON.parse(line.slice(index + prefix.length)); } catch { return { live, consumed: false }; }
  if (!["start", "case"].includes(event.type)) return { live, consumed: false };
  let next = live;
  if (live.runId !== event.run_id) {
    next = { ...resetProgress(live), runId: event.run_id, awaitingSince: live.awaitingSince || Date.now() / 1000 };
  }
  next = { ...next, total: event.total, samples: event.samples };
  if (event.type === "case" && event.case && !next.results.some((r) => r.id === event.case!.id)) {
    next = { ...next, results: [event.case, ...next.results], completed: Math.max(next.completed, event.completed) };
  }
  const passed = next.results.filter((r) => r.passed).length;
  return { consumed: true, live: { ...next,
    title: next.completed === next.total ? "Finalizing report…" : "Evaluating prompts…",
    count: `${next.completed} / ${next.total} prompts`, progress: next.completed,
    score: `${passed} passed · ${next.results.length - passed} failed` } };
}
