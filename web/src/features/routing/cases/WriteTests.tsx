import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { generateCases } from "@/api/endpoints/catalog";
import { stopAI } from "@/api/endpoints/routing";
import type { CaseRow, CatalogTool } from "@/api/types/routing";
import { Button, ErrLine, ICON, Icon, Muted, Progress } from "@/components/_ui";
import { MAX_TESTS, RECOMMENDED_TESTS, useRoutingStore, type ProposedItem } from "@/stores/routing.store";
import { useKeysPanel } from "@/features/keys/keys-panel.store";
import Proposals from "./Proposals";
import WriterSelect, { useWriter } from "./WriterSelect";
import WritingPrompt from "./WritingPrompt";
import { errorMessage, useCatalog } from "./useCatalog";

type Step = { kind: "idle" } | { kind: "writing"; done: number; tool: string };

// AI writes tests for several tools, one after the other, as many per tool as the user asked; the user
// reviews them, removes what does not fit, then adds the rest. What is added is ticked for the next run.
// `onActive`: whether its proposals are under review, for a host that steps aside meanwhile. `progressIn`:
// where the progress shows while it writes, below the host's own content; in place when not given.
function WriteTests({ tools, label, onActive, progressIn }: { tools: CatalogTool[]; label: string; onActive?: (active: boolean) => void; progressIn?: HTMLElement | null }) {
  const { catalog, save } = useCatalog(true);
  const writer = useWriter();
  const openKeys = useKeysPanel((s) => s.setOpen);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const perTool = useRoutingStore((s) => s.perTool);
  const setPerTool = useRoutingStore((s) => s.setPerTool);
  const [reading, setReading] = useState(false);
  // What the AI proposed and nobody kept yet: in the store, so leaving for the library loses none of it.
  const proposals = useRoutingStore((s) => s.proposals);
  const setProposals = useRoutingStore((s) => s.setProposals);
  const setAdding = useRoutingStore((s) => s.setAdding);
  useEffect(() => { onActive?.(proposals !== null); }, [proposals, onActive]);
  // Edits and ticks go back to the store as they are made; none left, and the way to write more returns.
  const keepItems = useCallback((items: ProposedItem[]) => {
    const current = useRoutingStore.getState().proposals;
    if (current) setProposals(items.length ? { ...current, items } : null);
  }, [setProposals]);
  const keepRan = useCallback((ran: string[] | null) => {
    const current = useRoutingStore.getState().proposals;
    if (current) setProposals({ ...current, ran });
  }, [setProposals]);
  const [error, setError] = useState("");
  // Start pressed with no key: the panel opened, and a box says why until the key is in.
  const [askedKey, setAskedKey] = useState(false);
  const stopped = useRef(false);

  const write = async () => {
    stopped.current = false;
    setError("");
    setAskedKey(false);
    const found: CaseRow[] = [];
    const failed: string[] = [];
    let cost: number | null = 0;
    for (const [index, tool] of tools.entries()) {
      if (stopped.current) break;
      setStep({ kind: "writing", done: index, tool: tool.title || tool.name });
      try {
        const answer = await generateCases(tool.name, "", writer.model, perTool);
        cost = cost === null || answer.cost === null ? null : cost + answer.cost;
        // Tools are asked one by one: a second tool's proposal can repeat the first's id or prompt. Compared as
        // the server compares them (trimmed, case folded), or one repeat would make it refuse the whole batch.
        const key = (text: string) => text.trim().toLowerCase();
        const taken = new Set([...(catalog?.cases ?? []), ...found].flatMap((row) => [`id:${key(row.id)}`, `p:${key(row.prompt)}`]));
        for (const row of answer.cases) {
          if (taken.has(`id:${key(row.id)}`) || taken.has(`p:${key(row.prompt)}`)) continue;
          taken.add(`id:${key(row.id)}`); taken.add(`p:${key(row.prompt)}`);
          found.push({ ...row, id: row.id.trim(), prompt: row.prompt.trim() });
        }
      } catch (e) {
        if (stopped.current) break;
        // No key, or the model refused: every other tool would fail the same way.
        if (index === 0) { setError(errorMessage(e)); setStep({ kind: "idle" }); return; }
        failed.push(tool.name);
      }
    }
    // Tools never asked (Stop came first), and tools whose every proposal repeated a test, have none either.
    const covered = new Set(found.map((row) => row.expect));
    const missing = tools.map((tool) => tool.name).filter((name) => !covered.has(name));
    setStep({ kind: "idle" });
    if (found.length) setProposals({ items: found.map((row, index) => ({ key: String(index), row, picked: true })), cost, failed: missing, ran: null });
    if (!found.length && !stopped.current) {
      setError(missing.length ? `No proposal for ${missing.join(", ")}. Try again, or write them yourself.` : "The AI proposed no test. Try again, or write one yourself.");
    }
  };

  // Kept: into the library, which then shows; the proposals not kept wait for the back arrow.
  const add = async (rows: CaseRow[], kept: string[]) => {
    await save([...(catalog?.cases ?? []), ...rows]);
    const left = (useRoutingStore.getState().proposals?.items ?? []).filter((item) => !kept.includes(item.key));
    const current = useRoutingStore.getState().proposals;
    setProposals(current && left.length ? { ...current, items: left, ran: null } : null);
    setAdding(false);
  };

  const progress = step.kind === "writing" ? (
    <div className="write-tests" id="write-tests" role="status">
      <Progress max={tools.length} value={step.done} ariaLabel="Tests written" />
      <p className="write-tests-now">
        Writing tests for <span className="tool-chip">{step.tool}</span>
        <Muted kind="dim">{`${step.done + 1} of ${tools.length}`}</Muted>
      </p>
      <Button variant="small" tone="danger" glyph="stop" id="write-tests-stop" onClick={() => { stopped.current = true; void stopAI(); }}>Stop</Button>
    </div>
  ) : null;
  // A host with room below its content keeps it in view and gets the progress under it.
  if (progress && !progressIn) return progress;
  if (proposals) {
    const done = new Set(proposals.items.map((item) => item.row.expect)).size;
    const count = proposals.items.length;
    const cost = proposals.cost === null ? "" : ` · $${proposals.cost.toFixed(4)}`;
    const head = (
      <div className="write-tests-head">
        <p><strong>{`${count} test${count === 1 ? "" : "s"} proposed`}</strong><Muted kind="dim">{` for ${done} tool${done > 1 ? "s" : ""}${cost}`}</Muted></p>
        <Muted as="p" kind="dim">Edit or remove the ones that don't fit, then run them.</Muted>
        {proposals.failed.length ? <ErrLine>{`No proposal for ${proposals.failed.join(", ")}: add those by hand.`}</ErrLine> : null}
      </div>
    );
    return (
      <div className="write-tests" id="write-tests">
        <div id="case-proposals"><Proposals items={proposals.items} onItems={keepItems} ran={proposals.ran} onRan={keepRan} onAdd={add} head={head} /></div>
      </div>
    );
  }
  return (
    <>
      <div className="write-tests-options">
        <label className="write-tests-count">
          <span>Tests per tool</span>
          <input type="number" id="write-tests-count" min={1} max={MAX_TESTS} value={perTool}
            onChange={(event) => setPerTool(Math.min(MAX_TESTS, Math.max(1, Math.round(Number(event.target.value) || 1))))} />
          <Muted kind="dim">{`(${RECOMMENDED_TESTS} recommended)`}</Muted>
        </label>
        <button type="button" className="linklike" id="write-tests-prompt" onClick={() => setReading(true)}>See the prompt</button>
      </div>
      <div className="write-tests-start">
        <Button tone="primary" mark="ai" id="write-tests-start" disabled={step.kind === "writing"} onClick={() => {
          // No key for the chosen model: say so, and open where one goes.
          if (!writer.keyed) { setError(""); setAskedKey(true); openKeys(true); return; }
          void write();
        }}>{label}</Button>
        <WriterSelect id="write-tests-model" />
      </div>
      {askedKey && !writer.keyed ? (
        <p className="error-note" id="write-tests-key" role="alert">
          <Icon html={ICON.alert} />
          <span><strong>{writer.model}</strong> needs an API key: add one in the panel that just opened.</span>
        </p>
      ) : null}
      {error ? <ErrLine className="write-tests-error">{error}</ErrLine> : null}
      {progress && progressIn ? createPortal(progress, progressIn) : null}
      {reading ? <WritingPrompt tools={tools} count={perTool} onClose={() => setReading(false)} /> : null}
    </>
  );
}

export default memo(WriteTests);
