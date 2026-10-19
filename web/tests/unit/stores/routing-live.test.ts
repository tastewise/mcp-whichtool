import { describe, expect, it } from "vitest";
import { consumeProgress, initialLive, resetProgress, updateProgressState } from "@/stores/routing-live";

const start = 'ROUTING_EVENT {"type":"start","run_id":"r1","total":3,"completed":0,"samples":3}';
const done = (id: string, passed: boolean, completed: number) =>
  `ROUTING_EVENT {"type":"case","run_id":"r1","total":3,"completed":${completed},"samples":3,"case":{"id":"${id}","prompt":"p","expect":"x","hits":${passed ? 3 : 1},"passed":${passed},"votes":[],"picks":["x","x","x"]}}`;

describe("routing-live", () => {
  it("reset shows the preparing state", () => {
    expect(resetProgress(initialLive())).toMatchObject({ title: "Preparing evaluation…", count: "Waiting for prompts", progress: null, score: "Waiting for live results…", awaiting: true, failed: false });
  });
  it("ignores lines that are not events", () => {
    expect(consumeProgress(initialLive(), "plain log").consumed).toBe(false);
    expect(consumeProgress(initialLive(), "ROUTING_EVENT not json").consumed).toBe(false);
    expect(consumeProgress(initialLive(), 'ROUTING_EVENT {"type":"other"}').consumed).toBe(false);
  });
  it("counts cases, newest first, and scores", () => {
    let live = consumeProgress(initialLive(), start).live;
    expect(live.runId).toBe("r1");
    expect(live.count).toBe("0 / 3 prompts");
    live = consumeProgress(live, done("a", true, 1)).live;
    live = consumeProgress(live, done("b", false, 2)).live;
    live = consumeProgress(live, done("b", false, 2)).live;
    expect(live.results.map((r) => r.id)).toEqual(["b", "a"]);
    expect(live.score).toBe("1 passed · 1 failed");
    expect(live.title).toBe("Evaluating prompts…");
    expect(live.progress).toBe(2);
    live = consumeProgress(live, done("c", true, 3)).live;
    expect(live.title).toBe("Finalizing report…");
  });
  it("a new run id resets", () => {
    let live = consumeProgress(initialLive(), start).live;
    live = consumeProgress(live, done("a", true, 1)).live;
    live = consumeProgress(live, start.replace("r1", "r2")).live;
    expect(live.results).toEqual([]);
    expect(live.runId).toBe("r2");
  });
  it("settles complete, stopped and failed", () => {
    let live = consumeProgress(initialLive(), start).live;
    live = consumeProgress(live, done("a", true, 1)).live;
    expect(updateProgressState(live, false, 0, 0).title).toBe("Evaluation ended before completion");
    expect(updateProgressState(consumeProgress(live, done("b", true, 3)).live, false, 0, 0).title).toBe("Evaluation complete");
    const stopped = updateProgressState(live, false, 143, 0);
    // Stopped is an end of its own: no report was written, so none is waited for.
    expect([stopped.title, stopped.failed, stopped.stopped]).toEqual(["Evaluation stopped", false, true]);
    expect(updateProgressState(stopped, true, null, 0).stopped).toBe(false);
    const failed = updateProgressState(live, false, 2, 0);
    expect([failed.title, failed.failed, failed.technicalOpens]).toEqual(["Evaluation failed", true, 1]);
    expect(updateProgressState(failed, false, 2, 0).technicalOpens).toBe(1);
  });
  it("does not settle on a previous run's exit code", () => {
    const live = { ...resetProgress(initialLive()), awaitingSince: 1000 };
    expect(updateProgressState(live, false, 2, 500).failed).toBe(false);
  });
  it("a run shorter than one poll still settles", () => {
    // The click stamps the wait; the first event arrives later and must not restamp it,
    // or the exit that follows reads as older than the wait and is discarded for ever.
    const clicked = { ...resetProgress(initialLive()), awaitingSince: 1000 };
    const started = consumeProgress(clicked, `ROUTING_EVENT ${JSON.stringify({ type: "start", run_id: "r1", total: 1, completed: 0, samples: 3 })}`).live;
    const live = consumeProgress(started, `ROUTING_EVENT ${JSON.stringify({ type: "case", run_id: "r1", total: 1, completed: 1, samples: 3, case: { id: "a", prompt: "?", expect: "t", hits: 3, passed: true, votes: [], picks: [] } })}`).live;
    expect(live.awaitingSince).toBe(1000);
    // The eval started at 1002 and exited before any poll saw it running.
    expect(updateProgressState(live, false, 0, 1002).title).toBe("Evaluation complete");
  });
  it("running without events says so", () => {
    expect(updateProgressState(initialLive(), true, null, 0).score).toBe("Waiting for live events. Runs started before this update only provide technical logs.");
  });
});

