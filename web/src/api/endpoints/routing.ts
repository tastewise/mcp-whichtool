import { fetchJson } from "../client";
import type { Advice, CaseRow, RoutingState, RunDetail } from "../types/routing";

export const getRoutingState = (filter: string, model: string) =>
  fetchJson<RoutingState>("GET", "/api/routing?filter=" + encodeURIComponent(filter) + (model ? "&model=" + encodeURIComponent(model) : ""));
export const getRun = (id: string) => fetchJson<RunDetail>("GET", "/api/routing/runs/" + encodeURIComponent(id));
export const suggestForRun = (id: string, caseId: string) => fetchJson<Advice>("POST", "/api/routing/runs/" + encodeURIComponent(id) + "/suggest", { case_id: caseId });
// `cases` runs exactly these ids; `filter` matches ids by substring. `descriptions` are drafts the run
// offers in place of the source's, by tool: nothing is written.
// `proposed`: tests under review, run whole without being saved.
export const startRoutingRun = (body: { draws: number; filter: string; model: string; cases?: string[]; descriptions?: Record<string, string>; proposed?: CaseRow[] }) => fetchJson<{ ok: true; result_path: string }>("POST", "/api/routing/run", body);
export const stopAI = () => fetchJson<{ stopped: boolean }>("POST", "/api/routing/ai/stop", {});
export const stopRoutingRun = () => fetchJson<unknown>("POST", "/api/routing/stop", {});
