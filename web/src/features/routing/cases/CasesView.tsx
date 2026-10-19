import { memo, useCallback, useMemo } from "react";
import type { CaseRow as Row } from "@/api/types/routing";
import { Button, CheckLabel, Input, Pager, SecHead, Select, Table, TableScroll } from "@/components/_ui";
import { toolOptions } from "@/lib/tool-label";
import { useRoutingStore } from "@/stores/routing.store";
import CaseRow from "./CaseRow";
import ExportTests from "./ExportTests";
import GetStarted from "./GetStarted";
import { PER_PAGE, errorMessage, expression, matching, uncovered, useCatalog } from "./useCatalog";

// The test library under the run bar: what is ticked here is what the bar prices and runs.
function CasesView({ hidden }: { hidden: boolean }) {
  const { catalog, error, status, setStatus, save, reload } = useCatalog(!hidden);
  const search = useRoutingStore((s) => s.caseSearch);
  const setSearch = useRoutingStore((s) => s.setCaseSearch);
  const tool = useRoutingStore((s) => s.caseTool);
  const setTool = useRoutingStore((s) => s.setCaseTool);
  const page = useRoutingStore((s) => s.casePage);
  const setPage = useRoutingStore((s) => s.setCasePage);
  const openCase = useRoutingStore((s) => s.openCase);
  const adding = useRoutingStore((s) => s.adding);
  const setAdding = useRoutingStore((s) => s.setAdding);
  const proposals = useRoutingStore((s) => s.proposals);
  const onEdit = useCallback((row: Row) => openCase(row, row.id), [openCase]);
  const onDelete = useCallback(async (row: Row) => {
    if (!confirm(`Delete test ${row.id}? Historical results will be kept.`)) return;
    const current = catalog;
    if (!current) return;
    try { await save(current.cases.filter((r) => r.id !== row.id)); } catch (e) { setStatus(errorMessage(e)); }
  }, [catalog, save, setStatus]);
  const turnTo = (next: number) => { setPage(next); document.getElementById("case-rows")?.scrollIntoView({ block: "start", behavior: "smooth" }); };

  // What the next run takes. Nothing until someone says so: a run costs money.
  const cases = useMemo(() => catalog?.cases ?? [], [catalog]);
  const ticked = useRoutingStore((s) => s.ticked);
  const tick = useCallback((next: Set<string>) => useRoutingStore.getState().setTicked(next, next.size ? expression(next, cases) : ""), [cases]);
  const onTick = useCallback((id: string) => {
    const next = new Set(useRoutingStore.getState().ticked);
    if (!next.delete(id)) next.add(id);
    tick(next);
  }, [tick]);

  const rows = catalog ? matching(catalog, search, tool) : [];
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PER_PAGE;
  const shown = rows.slice(from, from + PER_PAGE);
  // The header box acts on what the search and the tool filter show; ticks hidden by them still count, and say so.
  const shownTicked = rows.filter((row) => ticked.has(row.id)).length;
  const allShown = rows.length > 0 && shownTicked === rows.length;
  const filtered = rows.length < cases.length;
  const selectionText = !filtered ? `${ticked.size} of ${cases.length} selected`
    : `${shownTicked} of ${rows.length} shown selected` + (ticked.size > shownTicked ? ` · ${ticked.size} selected in total` : "");
  const gaps = catalog ? uncovered(catalog) : [];
  const statusText = error ? errorMessage(error) : catalog
    ? (rows.length === catalog.cases.length ? `${catalog.cases.length} prompts` : `${rows.length} of ${catalog.cases.length} prompts`) + (status ?? "") : "";

  // The page that adds tests: the library's own while it is empty, then behind its back arrow, with the
  // proposals not kept yet, or ways to write tests for the tools that have none (every tool once all have some).
  if (catalog && (!catalog.cases.length || adding)) {
    return (
      <section id="routing-library" className="card">
        {error ? <p id="case-status" role="status" className="err">{errorMessage(error)} <Button variant="small" glyph="restart" id="case-reload" onClick={() => void reload()}>Reload</Button></p> : null}
        {catalog.cases.length ? (
          <button type="button" className="linklike back-link" id="case-library-open" onClick={() => setAdding(false)}>
            {`Test library · ${catalog.cases.length} test${catalog.cases.length === 1 ? "" : "s"} →`}
          </button>
        ) : null}
        <GetStarted tools={gaps.length ? gaps : catalog.tools} first={!catalog.cases.length} />
      </section>
    );
  }
  return (
    <section id="routing-library" className="card">
      <button type="button" className="linklike back-link" id="case-add-open" onClick={() => setAdding(true)}>
        {proposals ? `← Back to the proposals (${proposals.items.length})` : "← Add tests"}
      </button>
      <SecHead right={<ExportTests ticked={[...ticked]} total={cases.length} />}>Test library</SecHead>
      <div className="catalog-filters">
        <Input id="case-search" aria-label="Search prompts" placeholder="Search prompts or IDs" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select id="case-tool-filter" aria-label="Filter by tool" value={tool} onValueChange={setTool} searchPlaceholder="Search tools"
          options={[{ value: "", label: "All tools" }, ...toolOptions(catalog?.tools ?? [], (t) => t.name, (t) => t.title)]} />
      </div>
      <div id="case-status" role="status">{statusText}</div>
      <div className="case-selection" id="case-selection">
        <CheckLabel kind="caseTick" inputId="case-all" checked={allShown} indeterminate={shownTicked > 0 && !allShown} onCheckedChange={() => {
          const next = new Set(ticked);
          for (const row of rows) { if (allShown) next.delete(row.id); else next.add(row.id); }
          tick(next);
        }}>
          <span id="case-ticked">{selectionText}</span>
        </CheckLabel>
        {ticked.size ? <Button variant="small" id="case-untick" onClick={() => tick(new Set())}>Clear</Button> : null}
      </div>
      <TableScroll>
        <Table head={["Export", "ID / prompt", "Expected tool", "Actions"]} bodyId="case-rows">
          {shown.map((row) => <CaseRow key={row.id} row={row} tools={catalog?.tools ?? []} ticked={ticked.has(row.id)} onTick={onTick} onEdit={onEdit} onDelete={onDelete} />)}
        </Table>
      </TableScroll>
      <Pager id="case-pager" hidden={rows.length <= PER_PAGE}>
        {rows.length > PER_PAGE ? <>
          <Button variant="step" aria-label="Previous page" glyph="prev" disabled={current === 1} title={current === 1 ? "First page: Next moves on" : undefined} onClick={() => turnTo(current - 1)} />
          <span>{`${from + 1}–${from + shown.length} of ${rows.length}`}</span>
          <Button variant="step" aria-label="Next page" glyph="next" disabled={current === pages} title={current === pages ? "Last page: Previous goes back" : undefined} onClick={() => turnTo(current + 1)} />
        </> : null}
      </Pager>
    </section>
  );
}

export default memo(CasesView);
