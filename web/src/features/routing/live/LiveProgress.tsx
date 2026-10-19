import { memo } from "react";
import { Inline, Muted, Progress } from "@/components/_ui";
import { useRoutingStore } from "@/stores/routing.store";
import { runIdOf } from "../advice/replay";
import LastRun from "./LastRun";
import LiveCase from "./LiveCase";

// routing.html #routing-live, driven by the routing-live reducer in the store.
function LiveProgress({ running, openRun = true }: { running: boolean; openRun?: boolean }) {
  const live = useRoutingStore((s) => s.live);
  // The run id the eval emits is the path it writes its report to, so the report it just
  // wrote can be read by name — no guessing which run was the last one.
  if (!running && live.runId && !live.failed && !live.stopped) return <LastRun id={runIdOf(live.runId)} open={openRun} />;
  return (
    <div className={live.failed ? "routing-live failed" : "routing-live"} id="routing-live">
      <Inline kind="liveHeading"><strong id="live-title">{live.title}</strong><span id="live-count">{live.count}</span></Inline>
      <Progress id="live-progress" max={Math.max(1, live.total)} value={live.progress} ariaLabel="Evaluation progress" />
      <Muted id="live-score" as="div" role="status">{live.score}</Muted>
      <div id="live-results">{live.results.map((row) => <LiveCase key={row.id} row={row} samples={live.samples} />)}</div>
    </div>
  );
}

export default memo(LiveProgress);
