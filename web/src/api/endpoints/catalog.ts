import { fetchJson } from "../client";
import type { CaseRow, Catalog, Generated, Tried } from "../types/routing";
export const getCatalog = () => fetchJson<Catalog>("GET", "/api/routing/catalog");
export const saveCatalog = (revision: string, cases: CaseRow[]) => fetchJson<Catalog>("PUT", "/api/routing/catalog", { revision, cases });
// `model` writes them: the project's when empty. `count`: how many, the server's recommendation when left out.
export const generateCases = (tool: string, scenario: string, model = "", count?: number) => fetchJson<Generated>("POST", "/api/routing/catalog/generate", { tool, scenario, model, count });
// The prompt that writes them, word for word, read before anything is billed.
export const writingPrompt = (tool: string, scenario: string, count?: number) =>
  fetchJson<{ system: string; prompt: string; recommended: number; max: number }>("POST", "/api/routing/catalog/generate/prompt", { tool, scenario, count });
export const tryCases = (cases: CaseRow[], model: string, draws: 1 | 3) => fetchJson<Tried>("POST", "/api/routing/try", { cases, model, draws });
