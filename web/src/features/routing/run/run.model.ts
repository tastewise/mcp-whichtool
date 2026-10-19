import type { RoutingState } from "@/api/types/routing";
import { MODEL_IDS } from "./models";

export function estimateText(state: RoutingState, draws: number): string {
  const selected = state.selected ?? 0;
  const calls = selected * draws;
  const hasPrice = state.per_call !== null && state.per_call !== undefined;
  const priced = hasPrice ? ` · about $${(calls * (state.per_call as number)).toFixed(2)} (estimate)` : " · no price for this model";
  return selected ? `${selected} prompts × ${draws} draws = ${calls} model calls${priced}` : "that filter selects no prompt";
}

// While a run is in flight this button is Stop, so it must stay pressable.
// Nothing until someone picks: a run is billed, and the model decides what it costs.
export const pickModel = (model: string, project: string[] = []): string => (MODEL_IDS.includes(model) || project.includes(model) ? model : "");
