import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { ApiError } from "@/api/client";
import { saveCatalog } from "@/api/endpoints/catalog";
import { keys } from "@/api/keys";
import { useCatalog as useCatalogQuery } from "@/api/queries/catalog";
import type { CaseRow, Catalog } from "@/api/types/routing";
import { useRoutingStore } from "@/stores/routing.store";

export const PER_PAGE = 25;
export const errorMessage = (error: unknown) => (error instanceof ApiError ? String(error.payload.detail || error.message) : error instanceof Error ? error.message : "Request failed");

// routing-editor.js: the catalog, its save (which returns the new catalog), and a status line.
export function useCatalog(enabled: boolean) {
  const client = useQueryClient();
  const query = useCatalogQuery(enabled);
  const status = useRoutingStore((s) => s.caseStatus);
  const setStatus = useRoutingStore((s) => s.setCaseStatus);
  const save = useCallback(async (cases: CaseRow[]) => {
    const current = client.getQueryData<Catalog>(keys.catalog);
    const saved = await saveCatalog(current?.revision ?? "", cases);
    client.setQueryData(keys.catalog, saved);
    // A test deleted or renamed is not a test to run any more: its tick goes with it.
    const store = useRoutingStore.getState();
    const known = new Set(saved.cases.map((row) => row.id));
    const kept = new Set([...store.ticked].filter((id) => known.has(id)));
    if (kept.size !== store.ticked.size) store.setTicked(kept, kept.size ? expression(kept, saved.cases) : "");
    setStatus(" · saved");
    return saved;
  }, [client, setStatus]);
  const reload = useCallback(() => { setStatus(null); return client.invalidateQueries({ queryKey: keys.catalog }); }, [client, setStatus]);
  return { catalog: query.data, error: query.error, status, setStatus, save, reload };
}

export function matching(catalog: Catalog, search: string, tool: string) {
  const needle = search.toLowerCase();
  return catalog.cases.filter((r) => (!tool || r.expect === tool) && (r.id + " " + r.prompt).toLowerCase().includes(needle));
}

// A tool with no prompt behind it is never exercised, however green the last run looked.
export function uncovered(catalog: Catalog) {
  const counted = new Map<string, number>();
  for (const row of catalog.cases) counted.set(row.expect, (counted.get(row.expect) || 0) + 1);
  return catalog.tools.filter((tool) => !counted.get(tool.name));
}

export const draftCase = (): CaseRow => ({ id: "case-" + Date.now(), prompt: "", expect: "" });
// The next test for the same tool after a save: the saved id with the first free numeric suffix.
export function nextCaseId(saved: string, taken: string[]): string {
  const base = saved.replace(/-\d+$/, "");
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
// Everything ticked is written as the empty filter: shorter, and what the eval means by all.
export function expression(ids: Set<string>, cases: CaseRow[]): string {
  return ids.size === cases.length ? "" : [...ids].join(" or ");
}
