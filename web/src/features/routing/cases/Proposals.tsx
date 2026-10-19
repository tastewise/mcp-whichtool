import { memo, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorText } from "@/api/client";
import { startRoutingRun, stopRoutingRun } from "@/api/endpoints/routing";
import type { CaseRow } from "@/api/types/routing";
import { Button, Card, CheckLabel, ErrLine, HelpTip, Mono, Muted, SegOpt, Segmented, Textarea } from "@/components/_ui";
import { taskKey } from "@/features/activity/useTaskOutput";
import { toolTitle } from "@/lib/tool-label";
import { useLogsStore } from "@/stores/logs.store";
import { useRoutingStore, type ProposedItem } from "@/stores/routing.store";
import LiveProgress from "../live/LiveProgress";
import TechnicalLogs from "../live/TechnicalLogs";
import ModelSelect from "../run/ModelSelect";
import { ROUTING_TASK } from "../run/models";
import { useRoutingRun } from "../run/useRoutingRun";
import { runIdOf } from "../advice/replay";
import { useRun } from "@/api/queries/routing";
import { errorMessage } from "./useCatalog";

// `head`: what sits left of the actions, which lead the list.
// `items`: proposals as last left, edits and ticks included, reported back through `onItems`; `onAdd` is told
// which keys it kept.
interface Props {
  candidates?: CaseRow[]; items?: ProposedItem[]; onItems?: (items: ProposedItem[]) => void;
  ran?: string[] | null; onRan?: (ran: string[] | null) => void;
  onAdd: (rows: CaseRow[], keys: string[]) => Promise<void>; head?: ReactNode;
}

const DRAWS = [[1, "1 · first look"], [3, "3 · majority"]] as const;
const plural = (n: number) => `${n} test${n === 1 ? "" : "s"}`;

// Tests the AI proposed, then the process to the end: edit or remove them, tick the ones to run, run them as an
// eval does (unsaved: progress, logs and report under the bar), and only then keep them: Keep and "Open the
// report" (to analyse a failed one) wait side by side at the foot of the run.
function Proposals({ candidates = [], items, onItems, ran: ranBefore = null, onRan, onAdd, head }: Props) {
  const client = useQueryClient();
  const [rows, setRows] = useState<ProposedItem[]>(() => items ?? candidates.map((row, index) => ({ key: String(index), row, picked: true })));
  useEffect(() => { onItems?.(rows); }, [rows, onItems]);
  const [busy, setBusy] = useState(false);
  // A refused save keeps the proposals and their edits, and says why beside the button.
  const [refused, setRefused] = useState("");
  const [problem, setProblem] = useState("");
  const model = useRoutingStore((s) => s.model);
  const setModel = useRoutingStore((s) => s.setModel);
  const [draws, setDraws] = useState<1 | 3>(1);
  // The keys of the tests the last run took: what "Keep" keeps, as edited since.
  const [ran, setRan] = useState<string[] | null>(ranBefore);
  useEffect(() => { onRan?.(ran); }, [ran, onRan]);
  const running = Boolean(useRoutingRun().state?.running);
  const live = useRoutingStore((s) => s.live);
  const setReviewing = useRoutingStore((s) => s.setReviewing);
  const setRunOpen = useRoutingStore((s) => s.setRunOpen);
  useEffect(() => { setReviewing(true); return () => setReviewing(false); }, [setReviewing]);

  const patch = (key: string, change: Partial<{ row: CaseRow; picked: boolean }>) =>
    setRows((all) => all.map((item) => (item.key === key ? { ...item, ...change } : item)));
  const remove = (key: string) => { setRows((all) => all.filter((item) => item.key !== key)); setProblem(""); };
  const picked = rows.filter((item) => item.picked);
  const run = async () => {
    if (running) { await stopRoutingRun().catch(() => undefined); return; }
    const missing = !picked.length ? "Tick at least one test to run." : !model ? "Choose a model to run them with first." : "";
    setProblem(missing);
    if (missing) return;
    try {
      useRoutingStore.getState().resetLive();
      await startRoutingRun({ draws, filter: "", model, proposed: picked.map((item) => item.row) });
      useLogsStore.getState().clear(taskKey(ROUTING_TASK));
      setRan(picked.map((item) => item.key));
    } catch (error) {
      setProblem(`Could not run them: ${errorText(error)}`);
    }
    await client.invalidateQueries({ queryKey: ["routing"] });
  };
  const kept = rows.filter((item) => ran?.includes(item.key));
  // The end of the process: a run that finished, its report read, and tests still there to keep.
  const report = useRun(ran && live.runId && !running ? runIdOf(live.runId) : null).data;
  const finished = Boolean(report) && !live.failed && kept.length > 0;

  return (
    <>
      <div className="ai-proposals-bar">
        {head}
        <div className="ai-proposals-actions">
          <div className="ai-proposals-try">
            <label className="ai-proposals-field"><span>Model</span>
              <ModelSelect id="case-try-proposals-model" value={model} onChange={setModel} />
            </label>
            <div className="ai-proposals-field">
              <span id="case-try-proposals-draws-label" className="ai-proposals-labelled">Draws per test
                <HelpTip label="What are draws?">How many times each test is asked. 1 is a quick first look; 3 asks three times and keeps the majority: steadier, and three times the cost.</HelpTip>
              </span>
              <Segmented mode="group" id="case-try-proposals-draws" ariaLabel="Draws per test" value={String(draws)} onValueChange={(v) => { if (v) setDraws(Number(v) as 1 | 3); }}>
                {DRAWS.map(([n, text]) => <SegOpt key={n} value={String(n)} on={draws === n} inuse={draws === n}>{text}</SegOpt>)}
              </Segmented>
            </div>
          </div>
          <Button action={running ? "stop" : "start"} glyph={running ? "stop" : undefined} id="case-try-proposals"
            tone={running ? "danger" : undefined} title="Runs each ticked test as an eval does: nothing is saved" onClick={() => void run()}>
            {running ? "Stop" : `Run ${plural(picked.length)}`}
          </Button>
        </div>
        {problem ? <ErrLine className="case-add-error case-proposals-empty">{problem}</ErrLine> : null}
      </div>
      {ran ? (
        <Card id="proposals-run">
          <LiveProgress running={running} openRun={false} />
          <TechnicalLogs running={running} />
          {finished ? (
            <div className="proposals-keep">
              <Button tone="primary" glyph="check" id="case-add-proposals" disabled={busy}
                title={`Adds ${kept.length === 1 ? "it" : "them"} to your test library. From there, Export packs your tests for your server's repository, to run in its CI.`}
                onClick={async () => {
                setBusy(true); setRefused("");
                try { await onAdd(kept.map((item) => item.row), kept.map((item) => item.key)); } catch (e) { setRefused(errorMessage(e)); } finally { setBusy(false); }
              }}>{busy ? "Keeping…" : kept.length === 1 ? "Keep this test" : `Keep these ${plural(kept.length)}`}</Button>
              {report ? <Button id="proposals-open-report" onClick={() => setRunOpen(report.id)}>Open the report</Button> : null}
              {refused ? <ErrLine className="case-add-error">{refused}</ErrLine> : null}
            </div>
          ) : null}
        </Card>
      ) : null}
      {rows.length ? (
        <div className="ai-proposals-all">
          <CheckLabel kind="caseTick" inputId="proposals-all" checked={picked.length === rows.length} indeterminate={picked.length > 0 && picked.length < rows.length}
            onCheckedChange={() => { const every = picked.length !== rows.length; setRows((all) => all.map((item) => ({ ...item, picked: every }))); }}>
            <span>{`Select all · ${picked.length} of ${rows.length} to run`}</span>
          </CheckLabel>
        </div>
      ) : null}
      {rows.map(({ key, row, picked: on }) => (
        <section className="ai-proposal" key={key} data-picked={on ? "yes" : "no"}>
          <div className="ai-proposal-head">
            <CheckLabel kind="caseTick" checked={on} onCheckedChange={() => patch(key, { picked: !on })}>
              <span className="ai-proposal-target"><Muted kind="dim">Should reach</Muted> <Mono>{row.expect}</Mono>
                {toolTitle(row.expect) !== row.expect ? <Muted kind="dim">{` ${toolTitle(row.expect)}`}</Muted> : null}</span>
            </CheckLabel>
            <Button variant="small" glyph="delete" aria-label="Remove this test" disabled={running} onClick={() => remove(key)}>Remove</Button>
          </div>
          <Textarea value={row.prompt} rows={3} aria-label="Proposed prompt" readOnly={running} onChange={(e) => patch(key, { row: { ...row, prompt: e.target.value } })} />
        </section>
      ))}
      {rows.length ? null : <Muted as="p" className="ai-proposals-none">Every proposal was removed.</Muted>}
    </>
  );
}

export default memo(Proposals);
