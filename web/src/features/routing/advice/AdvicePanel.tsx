import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/api/client";
import { startRoutingRun, stopAI, stopRoutingRun } from "@/api/endpoints/routing";
import { useSourceDescription } from "@/api/queries/changes";
import { useProject } from "@/api/queries/project";
import type { Advice, CaseRow, RunDetail } from "@/api/types/routing";
import { Button, GLYPH, ICON, IconButton, Muted, Pre, Progress, Select, Textarea, Waiting } from "@/components/_ui";
import { notify } from "@/lib/notify";
import { useRoutingStore } from "@/stores/routing.store";
import { adviceRequest, forgetAdvice, hasAdvice } from "./advice.cache";
import { finishedRun, replayed, runIdOf, verdict } from "./replay";
import { useSaveDescription } from "./useSaveDescription";

// Saving needs the source the description was read from.
const NO_SOURCE = "This description is not in a source the console edits: copy it into your server";

// `replay` is the eval case this proposal came from: its id, the model the run measured, the tools
// involved (the expected one first, then those the model picked instead), and the cases that run passed.
// `proposed`: the run was of tests under review, not saved: replays send them whole.
interface Replay { caseId: string; model: string; tools: string[]; passed: string[]; proposed?: CaseRow[] }
interface Props { cacheKey: string; request: () => Promise<Advice>; replay?: Replay }
type Phase = { kind: "idle" } | { kind: "analyzing" } | { kind: "ready"; advice: Advice } | { kind: "error"; message: string } | { kind: "editing"; tool: string };
// What a draft replaces: a tool, the source revision it was read at, and the description as it stands.
type Target = Pick<Advice, "tool" | "source_revision" | "original_description">;
// Each verdict keeps the draft it measured: it is shown only while that draft is the one on screen.
type Trial = { kind: "none" } | { kind: "running"; draft: string } | { kind: "said"; draft: string; text: string; passed: boolean };
// Every test with the draft, shown at the foot of the panel: its progress, then how it compares.
type Whole = { kind: "none" } | { kind: "running"; draft: string; runId: string } | { kind: "done"; draft: string; run: RunDetail }
  | { kind: "failed"; draft: string; message: string };
type Saving = { kind: "idle" } | { kind: "busy" } | { kind: "saved"; path: string; copied: boolean } | { kind: "failed"; message: string };

const DRAWS = 3;

const message = (error: unknown, fallback = "Could not generate a suggestion. Try again.") =>
  (error instanceof ApiError ? String(error.payload.detail || "") : "") || fallback;

// The description as the source holds it, then a draft of it; keyed by tool and revision, so a new
// source starts a new draft.
function HandEdit({ current, locked, children }: { current: string; locked: boolean; children: (text: string) => ReactNode }) {
  const [text, setText] = useState(current);
  return (
    <>
      <h5>Current description (current checkout)</h5>
      <Pre kind="before">{current}</Pre>
      <h5>New description</h5>
      <div className="ai-proposed">
        <Textarea value={text} rows={8} aria-label="New tool description" readOnly={locked} onChange={(event) => setText(event.target.value)} />
      </div>
      {children(text)}
    </>
  );
}

// A failed case: Ask AI for a fix, or write one by hand. Either draft is tried on this case, then on every
// test, without touching the source; Save to source writes it once it holds.
function AdvicePanel({ cacheKey, request, replay }: Props) {
  const saveDescription = useSaveDescription();
  // Files dropped in the page are a copy: saving keeps the description there, and hands it over for the real source.
  const project = useProject().data;
  const dropped = Boolean(project?.configured && project.uploaded);
  // A proposal already asked for is shown again on reopening.
  const [phase, setPhase] = useState<Phase>(() => (hasAdvice(cacheKey) ? { kind: "analyzing" } : { kind: "idle" }));
  const [proposed, setProposed] = useState("");
  const [copied, setCopied] = useState(false);
  const [trial, setTrial] = useState<Trial>({ kind: "none" });
  const [saving, setSaving] = useState<Saving>({ kind: "idle" });
  const [stopping, setStopping] = useState(false);
  const [whole, setWhole] = useState<Whole>({ kind: "none" });
  // A stopped run never writes its results: the wait for them is dropped, not answered later.
  const wholeToken = useRef(0);
  const live = useRoutingStore((state) => state.live);
  // A run going on for a draft: the draft and whatever would replace it stay put until it ends or is stopped.
  const busy = trial.kind === "running" || whole.kind === "running";
  const setRunOpen = useRoutingStore((state) => state.setRunOpen);
    const requestRef = useRef(request);
  useEffect(() => { requestRef.current = request; });
  const fresh = () => { setTrial({ kind: "none" }); setSaving({ kind: "idle" }); wholeToken.current += 1; setWhole({ kind: "none" }); };
  const show = () => { setStopping(false); fresh(); setPhase({ kind: "analyzing" }); };
  // Editing by hand: the description as the source holds it now, for the tool chosen.
  const editing = phase.kind === "editing" ? phase.tool : "";
  const { data: source, isFetched: sourceRead } = useSourceDescription(editing, Boolean(editing));
  const edit = (tool: string) => { fresh(); setPhase({ kind: "editing", tool }); };
  useEffect(() => {
    if (phase.kind !== "analyzing") return;
    let alive = true;
    adviceRequest(cacheKey, requestRef.current)
      .then((advice) => { if (alive) { setProposed(advice.suggested_description); setPhase({ kind: "ready", advice }); } })
      .catch((error) => { forgetAdvice(cacheKey); if (alive) setPhase({ kind: "error", message: message(error) }); });
    return () => { alive = false; };
  }, [phase.kind, cacheKey]);
  const copy = () => {
    navigator.clipboard.writeText(proposed)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })
      .catch(() => notify.warn("could not copy — select the text above"));
  };
  // The draft goes to the run, not to the file: the source stays as it is until Save to source.
  const drafts = (target: Target, text: string) => ({ [target.tool]: text.trim() });
  const tryIt = async (target: Target, text: string) => {
    if (!replay) return;
    const draft = text.trim();
    setTrial({ kind: "running", draft });
    try {
      const one = replay.proposed ? { proposed: replay.proposed.filter((row) => row.id === replay.caseId) } : { cases: [replay.caseId] };
      const started = await startRoutingRun({ draws: DRAWS, filter: "", ...one, model: replay.model, descriptions: drafts(target, text) });
      const { row, samples } = await replayed(runIdOf(started.result_path), replay.caseId);
      setTrial({ kind: "said", draft, text: verdict(row, samples, row.expect), passed: row.passed });
    } catch (error) {
      setTrial({ kind: "said", draft, text: message(error, "Could not replay this case."), passed: false });
    }
  };
  // Every test, the same model, the same draft: what else the new description moves. It runs here, under
  // the fix, so the answer lands where the question was asked.
  const tryAll = async (target: Target, text: string) => {
    if (!replay) return;
    const token = ++wholeToken.current;
    const draft = text.trim();
    try {
      const started = await startRoutingRun({ draws: DRAWS, filter: "", model: replay.model, descriptions: drafts(target, text), ...(replay.proposed ? { proposed: replay.proposed } : {}) });
      const runId = runIdOf(started.result_path).replace(/\.json$/, "");
      setWhole({ kind: "running", draft, runId });
      const run = await finishedRun(runId);
      if (token === wholeToken.current) setWhole({ kind: "done", draft, run });
    } catch (error) {
      if (token === wholeToken.current) setWhole({ kind: "failed", draft, message: message(error, "Could not run every test.") });
    }
  };
  const stopAll = () => {
    wholeToken.current += 1;
    setWhole((was) => ({ kind: "failed", draft: was.kind === "none" ? "" : was.draft, message: "Stopped: nothing was scored." }));
    void stopRoutingRun();
  };
  const wholeView = (text: string) => {
    if (whole.kind === "running") {
      const counting = live.runId === whole.runId && live.total > 0;
      return (
        <div className="waiting whole-run" role="status">
          <Progress max={counting ? live.total : 1} value={counting ? live.completed : null} ariaLabel="Every test with this description" />
          <p>{counting ? `Running every test with this description… ${live.completed} / ${live.total}` : "Running every test with this description…"}</p>
          <Button variant="small" tone="danger" glyph="stop" onClick={stopAll}>Stop</Button>
        </div>
      );
    }
    // A result about another draft than the one on screen says nothing about this one.
    if (whole.kind === "none" || whole.draft !== text.trim() || !replay) return null;
    if (whole.kind === "failed") return <p className="error" role="alert">{whole.message}</p>;
    const failed = whole.run.cases.filter((row) => !row.passed);
    const broke = failed.filter((row) => replay.passed.includes(row.id)).map((row) => row.id);
    const still = failed.filter((row) => !replay.passed.includes(row.id)).map((row) => row.id);
    return (
      <div className="whole-result" role="status">
        <h5>{`${whole.run.passed} / ${whole.run.total} passed with this description`}</h5>
        <p>{broke.length ? `It broke ${broke.join(", ")}: passed before, failing now.` : "Nothing that passed before broke."}</p>
        {still.length ? <Muted as="p">{`Still failing, as before: ${still.join(", ")}.`}</Muted> : null}
        <Button variant="small" onClick={() => setRunOpen(whole.run.id)}>Open the report</Button>
      </div>
    );
  };
  const save = async (target: Target, text: string) => {
    setSaving({ kind: "busy" });
    try {
      const saved = await saveDescription({ tool: target.tool, revision: target.source_revision ?? "", original_description: target.original_description, suggested_description: text.trim() });
      // The clipboard can refuse (no permission, page not focused): then the user is told to copy it by hand.
      const copied = dropped && await navigator.clipboard.writeText(text.trim()).then(() => true, () => false);
      setSaving({ kind: "saved", path: saved.path, copied });
    } catch (error) {
      setSaving({ kind: "failed", message: message(error, "Could not save the description.") });
    }
  };
  const actions = (target: Target, text: string) => {
    const said = trial.kind === "said" && trial.draft === text.trim() ? trial : null;
    return (
    <>
      {trial.kind === "running" ? (
        <Waiting label={`Replaying this prompt ${DRAWS} times on ${replay?.model ?? "the run's model"} with this description…`} />
      ) : (
        <div className="ai-actions">
          {replay ? <Button variant="small" mark="ai" disabled={!text.trim() || busy} title={`Replays this prompt ${DRAWS} times on ${replay.model} with this description — a billed eval run. The source is not touched.`} onClick={() => void tryIt(target, text)}>{said ? "Try it again" : "Try it on this case"}</Button> : null}
          {replay && said?.passed ? <Button variant="small" mark="ai" disabled={busy} title={`Runs every test ${DRAWS} times on ${replay.model} with this description — a billed eval run`} onClick={() => void tryAll(target, text)}>Run all tests with it</Button> : null}
          <Button variant="small" glyph="check" disabled={!target.source_revision || !text.trim() || saving.kind === "busy"} title={!target.source_revision ? NO_SOURCE : dropped ? "Keeps this description in the copy the tests read, and copies it for your server's source" : "Writes this description into the server's source"} onClick={() => void save(target, text)}>{saving.kind === "busy" ? "Saving…" : dropped ? "Save and copy" : "Save to source"}</Button>
        </div>
      )}
      {said ? (
        // The answer to "did the fix work": green and marked when it passes, red when it still fails.
        <p className="trial-verdict" data-passed={said.passed ? "yes" : "no"} role="status">
          <span className="trial-mark" aria-hidden="true">{said.passed ? "✓" : "✗"}</span>
          <span>{said.text}</span>
        </p>
      ) : null}
      {saving.kind === "saved" ? <Muted as="p" role="status">{!dropped ? `Saved in ${saving.path}. Every run now reads it.`
        : saving.copied ? `Copied: paste it into ${saving.path} in your server. Every run here now reads it.`
        : `Saved here, but the copy failed: copy it from the field above into ${saving.path} in your server.`}</Muted> : null}
      {saving.kind === "failed" ? <p className="error" role="alert">{saving.message}</p> : null}
      {wholeView(text)}
    </>
    );
  };
  const label = phase.kind === "analyzing" ? "Analyzing…" : phase.kind === "ready" ? "Proposal ready" : phase.kind === "error" ? "Retry Ask AI" : "Ask AI";
  return (
    <>
      <div className="ai-start">
        <Button variant="small" type="button" mark="ai" className="ai-ask" disabled={phase.kind === "analyzing" || phase.kind === "ready" || busy}
          title={phase.kind === "ready" ? "Use the proposal below, or open another case to ask again" : undefined} onClick={show}>{label}</Button>
        {replay && phase.kind !== "editing" ? <Button variant="small" type="button" glyph="edit" className="edit-description" disabled={phase.kind === "analyzing" || busy} onClick={() => edit(replay.tools[0] ?? "")}>Edit the description</Button> : null}
      </div>
      <Muted as="p">Ask AI explains the failure and proposes a description · Anthropic API, billed</Muted>
      <section className="ai-proposal" aria-live="polite">
        {phase.kind === "analyzing" ? (
          <Waiting label="Comparing current tool descriptions with this failure…">
            <Button variant="small" tone="danger" glyph="stop" id="advice-stop" disabled={stopping} onClick={() => { setStopping(true); void stopAI(); }}>{stopping ? "Stopping…" : "Stop"}</Button>
          </Waiting>
        ) : null}
        {phase.kind === "error" ? <p>{phase.message}</p> : null}
        {phase.kind === "ready" ? (
          <>
            <h4>{(phase.advice.verdict === "no change" ? "No change proposed · " : "Suggested change · ") + phase.advice.tool}</h4>
            <p>{phase.advice.diagnosis}</p>
            <h5>Current description (current checkout)</h5>
            <Pre kind="before">{phase.advice.original_description}</Pre>
            {phase.advice.verdict === "no change" ? null : <>
            <h5>Proposed description</h5>
            <div className="ai-proposed">
              <Textarea value={proposed} rows={8} aria-label="Proposed tool description" readOnly={busy} onChange={(event) => setProposed(event.target.value)} />
              <IconButton icon={copied ? GLYPH.check : ICON.copy} copied={copied} aria-label={copied ? "Copied" : "Copy the proposal"} title="Copy" onClick={copy} />
            </div>
            </>}
            <h5>{phase.advice.verdict === "no change" ? "Why it should stay" : "Why this change"}</h5><p>{phase.advice.rationale}</p>
            <h5>Risks / checks before saving</h5><p>{phase.advice.risks}</p>
            {phase.advice.verdict === "no change" ? null : actions(phase.advice, proposed)}
            <Muted as="p">{phase.advice.model + " · " + (phase.advice.cost == null ? "Cost unavailable" : `$${phase.advice.cost.toFixed(4)}`)}</Muted>
          </>
        ) : null}
        {phase.kind === "editing" && replay ? (
          <>
            <h4>Edit a description by hand</h4>
            <Select id="edit-tool" aria-label="Tool to edit" value={phase.tool} onValueChange={edit} disabled={busy}
              options={replay.tools.map((tool, index) => ({ value: tool, label: tool, hint: index === 0 ? "expected" : "picked instead" }))} />
            {!sourceRead ? <Waiting label="Reading the description from the source…" /> : !source ? (
              <p>{`No description for ${phase.tool} in a source the console edits. Edit it in your server, then run this case again.`}</p>
            ) : (
              <HandEdit key={`${phase.tool}:${source.revision}`} current={source.description} locked={busy}>
                {(text) => actions({ tool: phase.tool, source_revision: source.revision, original_description: source.description }, text)}
              </HandEdit>
            )}
            <Button variant="small" type="button" className="edit-close" disabled={busy} onClick={() => setPhase({ kind: "idle" })}>Close the editor</Button>
          </>
        ) : null}
      </section>
    </>
  );
}

export default memo(AdvicePanel);
