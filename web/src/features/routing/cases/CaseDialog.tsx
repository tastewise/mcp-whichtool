import { memo, useCallback, useEffect, useRef, useState } from "react";
import { generateCases } from "@/api/endpoints/catalog";
import { stopAI } from "@/api/endpoints/routing";
import type { CaseRow } from "@/api/types/routing";
import { Button, Drawer, Field, ICON, IconButton, Input, Muted, SecHead, Select, Textarea, Waiting } from "@/components/_ui";
import { toolOptions } from "@/lib/tool-label";
import { useRoutingStore } from "@/stores/routing.store";
import AddedNotice from "./AddedNotice";
import Proposals from "./Proposals";
import WriterSelect, { useWriter } from "./WriterSelect";
import TryOptions from "./TryOptions";
import TryProgress from "./TryProgress";
import TryVerdict from "./TryVerdict";
import { useTry } from "./useTry";
import { errorMessage, nextCaseId, useCatalog } from "./useCatalog";

function CaseDialog() {
  const dialog = useRoutingStore((s) => s.caseDialog);
  const closeCase = useRoutingStore((s) => s.closeCase);
  const { catalog, save } = useCatalog(Boolean(dialog));
  const [form, setForm] = useState<CaseRow>({ id: "", prompt: "", expect: "" });
  const [seen, setSeen] = useState<typeof dialog>(null);
  const [scenario, setScenario] = useState("");
  const [status, setFormStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [tryProblem, setTryProblem] = useState("");
  const noteAdded = useRoutingStore((s) => s.noteAdded);
  const [proposals, setProposals] = useState<CaseRow[] | null>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Once proposals are shown the scenario folds away; reopened only to steer a regeneration.
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  // The test written by hand, tried before Save: its verdict goes stale once it is edited.
  const tried = useTry();
  const writer = useWriter();
  const askAI = useRef<HTMLDivElement>(null);
  if (dialog !== seen) {
    setSeen(dialog);
    if (dialog) {
      setForm({ ...dialog.initial, expect: dialog.initial.expect || catalog?.tools[0]?.name || "" });
      setScenario(""); setFormStatus(""); setSaveError(""); setTryProblem(""); setProposals(null); setScenarioOpen(false); tried.reset();
    }
  }
  const close = useCallback(() => closeCase(), [closeCase]);
  const model = tried.model;
  const edit = (next: CaseRow) => { setForm(next); tried.forget("form"); setTryProblem(""); };
  // routing-editor.js coverGap: a gap opens the dialog on Ask AI, the scenario field focused.
  useEffect(() => {
    if (!dialog?.scenarioFocus) return;
    document.getElementById("case-scenario")?.focus({ preventScroll: true });
    askAI.current?.scrollIntoView?.({ block: "start" });
  }, [dialog]);
  // The proposals have just rendered: the drawer is now tall enough to put Ask AI at its top.
  // Instant, on the next frame: a smooth scroll was cut short while the proposals laid out.
  useEffect(() => {
    if (!round) return;
    const frame = requestAnimationFrame(() => askAI.current?.scrollIntoView?.({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [round]);
  const persist = async (cases: CaseRow[]) => { await save(cases); closeCase(); };
  const onSave = async () => {
    if (!catalog || !dialog) return;
    setBusy(true); setSaveError("");
    try {
      if (dialog.editing) { await persist(catalog.cases.map((r) => (r.id === dialog.editing ? form : r))); return; }
      // An add keeps the drawer open: the next test starts from the same tool, an empty prompt and a free id.
      await save([...catalog.cases, form]); noteAdded(1);
      setForm({ id: nextCaseId(form.id, [...catalog.cases.map((r) => r.id), form.id]), prompt: "", expect: form.expect }); tried.forget("form");
    }
    catch (e) { setSaveError(errorMessage(e)); } finally { setBusy(false); }
  };
  const onGenerate = async () => {
    setBusy(true); setGenerating(true); setStopping(false); setFormStatus("");
    try {
      const answer = await generateCases(form.expect, scenario, writer.model);
      setProposals(answer.cases); setRound((r) => r + 1); setScenarioOpen(false);
      const count = `${answer.cases.length} proposal${answer.cases.length > 1 ? "s" : ""}`;
      setFormStatus(`${count} · ${answer.cost == null ? "cost unavailable" : `$${answer.cost.toFixed(4)}`} · edit or remove before adding`);
    } catch (e) { setFormStatus(errorMessage(e)); } finally { setBusy(false); setGenerating(false); }
  };
  return (
    <Drawer id="case-dialog" labelledBy="case-dialog-title" open={Boolean(dialog)} onClose={close}>
      <SecHead titleId="case-dialog-title" right={<IconButton id="case-close" icon={ICON.close} join={false} aria-label="Close" title="Close" onClick={close} />}>{dialog?.editing ? "Edit test" : "Add test"}</SecHead>
      <Field label="ID"><Input id="case-id" value={form.id} onChange={(e) => edit({ ...form, id: e.target.value })} /></Field>
      <Field label="Expected tool"><Select id="case-tool" aria-label="Expected tool" value={form.expect} onValueChange={(expect) => edit({ ...form, expect })}
        placeholder="Choose a tool" searchPlaceholder="Search tools" options={toolOptions(catalog?.tools ?? [], (t) => t.name, (t) => t.title)} /></Field>
      <Field label="Prompt"><Textarea id="case-prompt" rows={5} value={form.prompt} onChange={(e) => edit({ ...form, prompt: e.target.value })} /></Field>
      <TryOptions id="case-try" model={tried.model} onModel={tried.setModel} draws={tried.draws} onDraws={tried.setDraws} />
      <p className="case-form-actions">
        <Button variant="small" tone="primary" id="case-save" glyph="check" disabled={busy} onClick={() => void onSave()}>Save test</Button>
        <Button variant="small" action="start" id="case-try" aria-busy={tried.busy} title="Routes this prompt once: nothing is saved"
          onClick={() => {
            if (tried.busy) return;
            // Pressable always: what is missing is said under the buttons, where the click was.
            const missing = !form.prompt.trim() ? "Type a prompt first." : !form.expect ? "Choose the expected tool first." : !model ? "Choose a model to try it with first." : "";
            setTryProblem(missing);
            if (!missing) void tried.run([{ key: "form", row: form }]);
          }}>{tried.busy ? "Trying…" : "Try"}</Button>
      </p>
      {tryProblem ? <p className="err try-error" id="case-try-missing" role="alert">{tryProblem}</p> : null}
      {saveError ? <p className="err try-error" id="case-save-error">{saveError}</p> : null}
      <TryProgress id="case-try-progress" calls={tried.calls} />
      <TryVerdict verdicts={tried.verdicts.form} />
      {tried.error ? <p className="err try-error">{tried.error}</p> : null}
      <hr />
      <div ref={askAI} className={proposals ? "case-ask-ai risen" : "case-ask-ai"}>
        <h3>Ask AI</h3>
        {proposals && !scenarioOpen ? (
          <p className="case-form-actions" id="case-ask-compact">
            <Button variant="small" id="case-generate" mark="ai" disabled={busy} onClick={() => void onGenerate()}>Regenerate</Button>
            <Button variant="small" id="case-scenario-open" disabled={busy} onClick={() => setScenarioOpen(true)}>{scenario.trim() ? "Change scenario" : "Add a scenario"}</Button>
          </p>
        ) : <>
          <Muted as="p">Generate candidate tests for the selected tool, billed to your API key. Review before adding.</Muted>
          <WriterSelect id="case-writer" />
          <Field label="Scenario (optional)"><Textarea id="case-scenario" rows={2} placeholder="For example: boundaries with neighboring tools" value={scenario} onChange={(e) => setScenario(e.target.value)} /></Field>
          <Button variant="small" id="case-generate" mark="ai" disabled={busy} onClick={() => {
            if (!writer.keyed) { setFormStatus(`${writer.model} needs an API key: add one under API keys, at the top of the page.`); return; }
            void onGenerate();
          }}>{proposals ? "Regenerate" : "Generate proposals"}</Button>
        </>}
        {generating ? (
          <Waiting id="case-generating" label="Asking for candidate tests…">
            <Button variant="small" tone="danger" glyph="stop" id="case-stop" disabled={stopping} onClick={() => { setStopping(true); void stopAI(); }}>{stopping ? "Stopping…" : "Stop"}</Button>
          </Waiting>
        ) : null}
        <Muted id="case-form-status" as="div" role="status">{status}</Muted>
        <div id="case-proposals">
          {proposals ? <Proposals key={round} candidates={proposals}
            onAdd={async (rows) => {
              await save([...(catalog?.cases ?? []), ...rows]); setProposals(null); setFormStatus(""); noteAdded(rows.length);
            }} /> : null}
        </div>
      </div>
      <AddedNotice />
    </Drawer>
  );
}

export default memo(CaseDialog);
