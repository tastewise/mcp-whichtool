import { memo, useState } from "react";
import { ErrLine, Muted, SegOpt, Segmented } from "@/components/_ui";
import { useRoutingStore } from "@/stores/routing.store";
import ModelSelect from "./ModelSelect";
import { estimateText } from "./run.model";
import { useRoutingRun } from "./useRoutingRun";

const DRAWS = [[3, "3 · majority"], [1, "1 · first look"]] as const;

// One line above the library: the model, the draws, what the ticked tests cost, and Run.
function RunBar() {
  const { state, failed, run, busy, effectiveModel } = useRoutingRun();
  const ticked = useRoutingStore((s) => s.ticked.size);
  const draws = useRoutingStore((s) => s.draws);
  const setDraws = useRoutingStore((s) => s.setDraws);
  const [said, setSaid] = useState("");
  const available = Boolean(state?.available);
  const running = Boolean(state?.running);
  const scope = failed || !state ? "—" : !available ? "Routing not configured" : ticked ? `${ticked} of ${state.total} tests` : "No test ticked";
  const estimate = available && ticked && effectiveModel ? estimateText(state!, draws) : available && ticked ? "Choose a model to price the run" : "Tick tests in the library below";
  const label = running ? "Stop" : ticked ? `Run ${ticked}` : "Run";
  // What stands between a click and a run. The button stays pressable: a click says it, where the eye is.
  const blocked = busy ? undefined : failed || !state ? "Reload once the console answers" : !available ? "Set up the routing eval first: run whichtool init"
    : running ? undefined : !ticked ? "Tick tests in the library below first" : !effectiveModel ? "Choose a model first" : undefined;
  return (
    <div className="card run-bar" id="routing-run-bar">
      <label className="run-bar-field"><span>Model</span><ModelSelect value={effectiveModel} /></label>
      <div className="run-bar-field">
        <span>Draws</span>
        {/* The group reports "" for a click on the option already on: ignore it. */}
        <Segmented mode="group" id="routing-draws" ariaLabel="Draws" value={String(draws)} onValueChange={(v) => { if (v) setDraws(Number(v) as 1 | 3); }}>
          {DRAWS.map(([n, text]) => <SegOpt key={n} value={String(n)} on={draws === n} inuse={draws === n}>{text}</SegOpt>)}
        </Segmented>
      </div>
      <div className="run-bar-scope">
        <strong id="routing-state">{scope}</strong>
        <Muted id="routing-estimate">{estimate}</Muted>
      </div>
      <div className="run-bar-go">
        <button className="small" id="routing-run" disabled={busy}
          data-running={available ? String(running) : undefined} data-action={available ? (running ? "stop" : "start") : undefined}
          onClick={() => { if (blocked) { setSaid(blocked); return; } setSaid(""); void run(); }}>
          {label}
        </button>
        {said && said === blocked ? <ErrLine className="run-bar-blocked">{said}</ErrLine> : null}
      </div>
    </div>
  );
}

export default memo(RunBar);
