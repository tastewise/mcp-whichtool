import { useCallback, useState } from "react";
import { tryCases } from "@/api/endpoints/catalog";
import { useProjectModels } from "@/api/queries/routing";
import type { CaseRow, TriedCase } from "@/api/types/routing";
import { pickModel } from "@/features/routing/run/run.model";
import { useRoutingStore } from "@/stores/routing.store";
import { errorMessage } from "./useCatalog";

// Route prompts before they are saved, with this Try's own model and draws: nothing is written.
export function useTry() {
  // One model for the whole page: picked once, every Try and the run bar use it.
  const model = useRoutingStore((s) => s.model);
  const setModel = useRoutingStore((s) => s.setModel);
  const projectModels = useProjectModels();
  const [draws, setDraws] = useState<1 | 3>(1);
  // The model calls in flight, for the progress bar; 0 when idle.
  const [calls, setCalls] = useState(0);
  const [error, setError] = useState("");
  // Every try of a prompt, oldest first: a new model or draw count adds a line, it does not replace one.
  const [verdicts, setVerdicts] = useState<Record<string, TriedCase[]>>({});
  const [cost, setCost] = useState<number | null>(null);
  const run = useCallback(async (rows: { key: string; row: CaseRow }[]) => {
    setCalls(rows.length * draws); setError("");
    try {
      const tried = await tryCases(rows.map((r) => r.row), model, draws);
      setVerdicts((was) => ({ ...was, ...Object.fromEntries(rows.map((r, i) => [r.key, [...(was[r.key] ?? []), { ...tried.results[i]!, model: tried.model }]])) }));
      setCost(tried.cost);
    } catch (e) { setError(errorMessage(e)); } finally { setCalls(0); }
  }, [model, draws]);
  // An edited prompt is another prompt: its earlier tries no longer describe it.
  const forget = useCallback((key: string) => setVerdicts((was) => Object.fromEntries(Object.entries(was).filter(([k]) => k !== key))), []);
  // Another test in the drawer: the last one's verdicts no longer describe anything shown.
  const reset = useCallback(() => { setVerdicts({}); setError(""); setCost(null); }, []);
  return { busy: calls > 0, calls, error, verdicts, cost, run, forget, reset, model: pickModel(model, projectModels), setModel, draws, setDraws };
}
