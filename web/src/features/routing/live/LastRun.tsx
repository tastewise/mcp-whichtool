import { memo, useState } from "react";
import { useRun } from "@/api/queries/routing";
import { Button, CheckLabel, Empty, Inline, Muted } from "@/components/_ui";
import { costLabel } from "@/lib/time";
import { useRoutingStore } from "@/stores/routing.store";
import LiveCase from "./LiveCase";

// What the run that just ended actually found. It replaces the progress bar rather than
// leaving it full: a bar at 100% is a state, not a result. `open`: false where the host
// offers the report itself, beside its own action.
function LastRun({ id, open = true }: { id: string; open?: boolean }) {
  const { data: run } = useRun(id);
  const setRunOpen = useRoutingStore((state) => state.setRunOpen);
  const [failedOnly, setFailedOnly] = useState(false);
  if (!run) return <div className="routing-live" id="routing-live"><Muted as="p">Reading the report…</Muted></div>;
  const failed = run.cases.filter((row) => !row.passed);
  const rows = failedOnly ? failed : run.cases;
  return (
    <div className="routing-live done" id="routing-live">
      <Inline kind="liveHeading">
        <strong id="live-title">{`${run.passed} / ${run.total} passed`}</strong>
        <span id="live-count">{`${run.samples} draws · ${costLabel(run.cost)}`}</span>
      </Inline>
      <Muted id="live-score" as="div" role="status">{run.model}</Muted>
      {run.cases.length ? <CheckLabel kind="runFilter" checked={failedOnly} onCheckedChange={setFailedOnly}>{`Failed only (${failed.length})`}</CheckLabel> : null}
      <div id="live-results">
        {rows.length
          ? rows.map((row) => <LiveCase key={row.id} row={row} samples={run.samples} picksLabel="Draws" />)
          : <Empty as="p">Every prompt in this run reached its tool.</Empty>}
      </div>
      {open ? <Button variant="small" id="live-open" onClick={() => setRunOpen(run.id)}>Open the report</Button> : null}
    </div>
  );
}

export default memo(LastRun);
