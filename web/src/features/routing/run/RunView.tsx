import { memo } from "react";
import { Card } from "@/components/_ui";
import { useRoutingStore } from "@/stores/routing.store";
import CasesView from "../cases/CasesView";
import LiveProgress from "../live/LiveProgress";
import TechnicalLogs from "../live/TechnicalLogs";

// The library, and the live run when one is going outside a review (left mid-run): it can be stopped here.
// Tests run from the review of proposals, which holds its own progress and report.
function RunView({ hidden, running }: { hidden: boolean; running: boolean }) {
  const reviewing = useRoutingStore((s) => s.reviewing);
  return (
    <div id="routing-view-run" hidden={hidden}>
      {running && !reviewing ? <Card id="routing-live-card"><LiveProgress running={running} /><TechnicalLogs running={running} /></Card> : null}
      <CasesView hidden={hidden} />
    </div>
  );
}

export default memo(RunView);
