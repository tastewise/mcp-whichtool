export interface RoutingState {
  // `models`: the project's own — its configured model and every priced one — whatever the page lists.
  available: boolean; model?: string; models?: string[]; total?: number; selected?: number; per_call?: number | null;
  running?: boolean; exit_code?: number | null; started_at?: number; result?: unknown;
}
export interface RunCase { id: string; prompt: string; expect: string; hits: number; passed: boolean; votes: { tool: string; count: number }[]; picks: string[] }
export interface RunDetail {
  id: string; provider: string; model: string; samples: number; usage: Record<string, number>;
  total: number; passed: number; result_mtime: number; cost: number | null; cases: RunCase[];
  // Draft descriptions this run offered in place of the source's, by tool.
  drafts?: Record<string, string>;
  // Tests under review, not in the library: replays send them again rather than naming them.
  proposed?: boolean;
}
export interface Advice {
  verdict: "change" | "no change"; tool: string; original_description: string; suggested_description: string; diagnosis: string;
  rationale: string; risks: string; model: string; cost: number | null; source_revision: string | null;
}
export interface CaseRow { id: string; prompt: string; expect: string }
// A prompt routed before it is in the catalog: what the model picked, and whether that is the expected tool.
export interface TriedCase { id: string; expect: string; picks: (string | null)[]; passed: boolean; model?: string }
export interface Tried { model: string; results: TriedCase[]; cost: number | null }
export interface CatalogTool { name: string; title: string; description?: string; revision?: string }
export interface Catalog { revision: string; cases: CaseRow[]; tools: CatalogTool[] }
export interface Generated { cases: CaseRow[]; model: string; cost: number | null }
// routing-live.js: a ROUTING_EVENT line, start or case.
export interface RoutingEvent { type: "start" | "case"; run_id: string; total: number; completed: number; samples: number; case?: RunCase }
