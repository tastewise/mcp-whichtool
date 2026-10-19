import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CaseDialog from "@/features/routing/cases/CaseDialog";
import CasesView from "@/features/routing/cases/CasesView";
import RunBar from "@/features/routing/run/RunBar";
import { useRoutingStore } from "@/stores/routing.store";
import catalog from "../../fixtures/routing-catalog.json";
import routingState from "../../fixtures/routing-state.json";
import generated from "../../fixtures/routing-generate.json";
import { server } from "../support/msw";
import { proposalsRunServer, runProposalsToTheEnd } from "../support/proposals-run";
import { openAddTest } from "../support/add-test";
import { renderWithQuery } from "../support/query";
import { optionsOf, pickOption, selectValue } from "../support/select";

describe("CasesView", () => {
  beforeEach(() => useRoutingStore.setState({ caseDialog: null, caseSearch: "", caseTool: "", casePage: 1, filter: "", ticked: new Set(), model: "claude-sonnet-5", proposals: null, adding: false }));
  it("lists cases, names the uncovered tool, and the header box ticks what the filter shows", async () => {
    server.use(http.get("/api/routing/catalog", () => HttpResponse.json(catalog)));
    const { container } = renderWithQuery(<CasesView hidden={false} />);
    await waitFor(() => expect(container.querySelectorAll("#case-rows tr")).toHaveLength(3));
    expect(document.getElementById("case-status")!.textContent).toBe("3 prompts");
    // Adding tests is a page of its own, behind the library's back arrow.
    expect(document.getElementById("case-add-open")!.textContent).toBe("← Add tests");
    expect(document.getElementById("write-tests-start")).toBeNull();
    expect(document.getElementById("case-pager")!.hasAttribute("hidden")).toBe(true);
    const all = document.getElementById("case-all") as HTMLInputElement;
    // One tick outside the filter: it stays ticked, and the count says so.
    fireEvent.click(container.querySelectorAll<HTMLInputElement>("td.casetick input")[1]!);
    await pickOption("case-tool-filter", "search_books");
    await waitFor(() => expect(container.querySelectorAll("#case-rows tr")).toHaveLength(1));
    expect(document.getElementById("case-ticked")!.textContent).toBe("0 of 1 shown selected · 1 selected in total");
    expect([all.checked, all.indeterminate]).toEqual([false, false]);
    fireEvent.click(all);
    expect(useRoutingStore.getState().ticked).toEqual(new Set(["recommend-from-title", "search-topic"]));
    expect(document.getElementById("case-ticked")!.textContent).toBe("1 of 1 shown selected · 2 selected in total");
    expect(all.checked).toBe(true);
    // Unticking the shown rows leaves the hidden tick alone.
    fireEvent.click(all);
    expect(useRoutingStore.getState().filter).toBe("recommend-from-title");
    fireEvent.click(document.getElementById("case-untick")!);
    expect(useRoutingStore.getState().filter).toBe("");
  });
  it("drops a deleted test from what the run takes", async () => {
    let put: { cases: { id: string }[] } | null = null;
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(put ? { ...catalog, cases: put.cases, revision: "rev-2" } : catalog)),
      http.put("/api/routing/catalog", async ({ request }) => {
        put = (await request.json()) as { cases: { id: string }[] };
        return HttpResponse.json({ ...catalog, cases: put.cases, revision: "rev-2" });
      }),
      http.get("/api/routing", () => HttpResponse.json({ ...routingState, selected: 2, total: 3 })),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = renderWithQuery(<CasesView hidden={false} />);
    await waitFor(() => expect(container.querySelectorAll("#case-rows tr")).toHaveLength(3));
    const ticks = () => [...container.querySelectorAll<HTMLInputElement>("td.casetick input")];
    fireEvent.click(ticks()[0]!);
    fireEvent.click(ticks()[1]!);
    expect(useRoutingStore.getState().ticked.size).toBe(2);
    fireEvent.click(container.querySelectorAll<HTMLButtonElement>('#case-rows tr button[data-action="delete"]')[1]!);
    await waitFor(() => expect(container.querySelectorAll("#case-rows tr")).toHaveLength(2));
    // The deleted test is no longer counted nor run.
    expect([...useRoutingStore.getState().ticked]).toEqual(["search-topic"]);
    expect(useRoutingStore.getState().filter).toBe("search-topic");
    confirm.mockRestore();
  });

  it("offers the project's own models, those the page's list does not know", async () => {
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
      http.get("/api/routing", () => HttpResponse.json({ ...routingState, models: ["acme-router-1", "claude-opus-5-5"] })),
    );
    renderWithQuery(<RunBar />);
    await waitFor(async () => expect(await optionsOf("routing-model")).toContain("acme-router-1"));
    await pickOption("routing-model", "acme-router-1");
    await waitFor(() => expect(selectValue("routing-model")).toBe("acme-router-1"));
  });

  it("selects nothing until asked, and runs exactly what is ticked", async () => {
    let started: unknown = null;
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
      http.get("/api/routing", () => HttpResponse.json({ ...routingState, selected: 3, total: 3 })),
      http.post("/api/routing/run", async ({ request }) => { started = await request.json(); return HttpResponse.json({ ok: true, result_path: "/r/run.json" }); }),
    );
    const { container } = renderWithQuery(<><RunBar /><CasesView hidden={false} /></>);
    await waitFor(() => expect(container.querySelectorAll("#case-rows tr")).toHaveLength(3));
    const ticks = () => [...container.querySelectorAll<HTMLInputElement>("td.casetick input")];
    expect(ticks().some((box) => box.checked)).toBe(false);
    expect(document.getElementById("case-ticked")!.textContent).toBe("0 of 3 selected");
    fireEvent.click(document.getElementById("routing-run")!);
    expect(started).toBeNull();
    expect(document.getElementById("routing-estimate")!.textContent).toBe("Tick tests in the library below");

    fireEvent.click(ticks()[1]!);
    expect(document.getElementById("case-ticked")!.textContent).toBe("1 of 3 selected");
    expect(document.getElementById("routing-run")!.textContent).toBe("Run 1");
    await waitFor(() => expect(document.getElementById("routing-estimate")!.textContent).toContain("prompts × 3 draws"));

    // The header box is a real toggle: all, then none.
    fireEvent.click(document.getElementById("case-all")!);
    expect(ticks().every((box) => box.checked)).toBe(true);
    expect(document.getElementById("routing-run")!.textContent).toBe("Run 3");
    expect(useRoutingStore.getState().filter).toBe("");
    fireEvent.click(document.getElementById("case-all")!);
    expect(ticks().some((box) => box.checked)).toBe(false);

    fireEvent.click(ticks()[1]!);
    await waitFor(() => expect(document.getElementById("routing-estimate")!.textContent).toContain("prompts × 3 draws"));
    fireEvent.click(document.getElementById("routing-run")!);
    await waitFor(() => expect(started).toMatchObject({ draws: 3, filter: "recommend-from-title" }));
  });

  it("keeps the proposals and says why when the save is refused", async () => {
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
      http.post("/api/routing/catalog/generate", () => HttpResponse.json(generated)),
      http.put("/api/routing/catalog", () => HttpResponse.json({ detail: "The checkout branch changed. Return to the editing branch before continuing." }, { status: 409 })),
    );
    renderWithQuery(<><CasesView hidden={false} /><CaseDialog /></>);
    await openAddTest("list_genres");
    fireEvent.click(document.getElementById("case-generate")!);
    await waitFor(() => expect(document.querySelectorAll("#case-proposals .ai-proposal")).toHaveLength(2));
    proposalsRunServer();
    await runProposalsToTheEnd("Run 2 tests");
    fireEvent.click(await screen.findByRole("button", { name: "Keep these 2 tests" }));
    await waitFor(() => expect(document.querySelector("#case-proposals .case-add-error")).not.toBeNull());
    expect(document.querySelector("#case-proposals .case-add-error")!.textContent).toBe("The checkout branch changed. Return to the editing branch before continuing.");
    expect(document.querySelectorAll("#case-proposals .ai-proposal")).toHaveLength(2);
    expect(document.getElementById("case-landed")).toBeNull();
  });

  it("opens the dialog from the page that adds tests, generates proposals and saves the chosen one", async () => {
    let put: unknown = null;
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
      http.post("/api/routing/catalog/generate", () => HttpResponse.json(generated)),
      http.put("/api/routing/catalog", async ({ request }) => { put = await request.json(); return HttpResponse.json({ ...catalog, revision: "rev-2", cases: (put as { cases: unknown[] }).cases }); }),
    );
    renderWithQuery(<><CasesView hidden={false} /><CaseDialog /></>);
    await openAddTest("list_genres");
    expect(selectValue("case-tool")).toBe("list_genres");
    fireEvent.click(document.getElementById("case-generate")!);
    await waitFor(() => expect(document.querySelectorAll("#case-proposals .ai-proposal")).toHaveLength(2));
    expect(document.getElementById("case-form-status")!.textContent).toBe("2 proposals · $0.0201 · edit or remove before adding");
    // The proposals take the room: the scenario folds into one line, and reopens on demand.
    expect(document.getElementById("case-scenario")).toBeNull();
    expect(document.getElementById("case-generate")!.textContent).toContain("Regenerate");
    fireEvent.click(document.getElementById("case-scenario-open")!);
    expect(document.getElementById("case-scenario")).not.toBeNull();
    // Removing one leaves the other; the run counts what it takes, and keeping it ends the process.
    fireEvent.click(screen.getAllByRole("button", { name: "Remove this test" })[0]!);
    proposalsRunServer();
    await runProposalsToTheEnd("Run 1 test");
    fireEvent.click(await screen.findByRole("button", { name: "Keep this test" }));
    await waitFor(() => expect((put as { cases: unknown[] } | null)?.cases).toHaveLength(4));
    // The drawer stays open for the next test; its foot says what was added and where it waits.
    await waitFor(() => expect(document.getElementById("case-added")!.textContent).toContain("1 test added to the library."));
    expect(document.getElementById("case-dialog")!.hasAttribute("open")).toBe(true);
    expect(document.querySelectorAll("#case-proposals .ai-proposal")).toHaveLength(0);
    act(() => useRoutingStore.getState().noteAdded(1));
    expect(document.getElementById("case-added")!.textContent).toContain("2 tests added to the library.");
    // Nothing to publish here: the cases file is saved, the notice only dismisses.
    expect(document.getElementById("case-added-review")).toBeNull();
    act(() => useRoutingStore.getState().clearAdded());
  });
});
