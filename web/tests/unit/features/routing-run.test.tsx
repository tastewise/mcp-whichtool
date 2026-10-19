import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import RunDrawer from "@/features/routing/live/RunDrawer";
import RunBar from "@/features/routing/run/RunBar";
import RunView from "@/features/routing/run/RunView";
import { estimateText } from "@/features/routing/run/run.model";
import { useRoutingStore } from "@/stores/routing.store";
import { initialLive } from "@/stores/routing-live";
import state from "../../fixtures/routing-state.json";
import run from "../../fixtures/routing-run.json";
import catalog from "../../fixtures/routing-catalog.json";
import advice from "../../fixtures/routing-advice.json";
import { installFakeEventSource } from "../support/fake-event-source";
import { server } from "../support/msw";
import { renderWithQuery } from "../support/query";
import { optionsOf, pickOption, selectValue } from "../support/select";

describe("estimateText", () => {
  it("prices the run or says there is no price", () => {
    expect(estimateText({ ...state, selected: 10, per_call: 0.01 }, 3)).toBe("10 prompts × 3 draws = 30 model calls · about $0.30 (estimate)");
    expect(estimateText({ ...state, selected: 10, per_call: null }, 1)).toBe("10 prompts × 1 draws = 10 model calls · no price for this model");
    expect(estimateText({ ...state, selected: 0 }, 3)).toBe("that filter selects no prompt");
  });
});

describe("RunBar", () => {
  beforeEach(() => useRoutingStore.setState({ model: "", filter: "", ticked: new Set(), draws: 3, live: initialLive() }));
  it("runs nothing until tests are ticked and a model is chosen", async () => {
    server.use(http.get("/api/routing", () => HttpResponse.json(state)));
    renderWithQuery(<RunBar />);
    await waitFor(() => expect(document.getElementById("routing-state")!.textContent).toBe("No test ticked"));
    const button = document.getElementById("routing-run") as HTMLButtonElement;
    expect(selectValue("routing-model")).toBe("");
    // Pressable all along: a click says what is missing, beside the button, and starts nothing.
    expect([button.textContent, button.disabled]).toEqual(["Run", false]);
    fireEvent.click(button);
    expect(document.querySelector(".run-bar-blocked")!.textContent).toBe("Tick tests in the library below first");
    act(() => useRoutingStore.getState().setTicked(new Set(["a", "b"]), "a or b"));
    expect(document.querySelector(".run-bar-blocked")).toBeNull();
    fireEvent.click(button);
    expect(document.querySelector(".run-bar-blocked")!.textContent).toBe("Choose a model first");
    await pickOption("routing-model", "claude-sonnet-5");
    expect(useRoutingStore.getState().model).toBe("claude-sonnet-5");
    expect(document.querySelector(".run-bar-blocked")).toBeNull();
    expect(button.textContent).toBe("Run 2");
    expect(document.getElementById("routing-state")!.textContent).toBe("2 of 141 tests");
  });

  it("prices the ticked tests, switches draws, and toggles to Stop while running", async () => {
    useRoutingStore.setState({ model: "claude-sonnet-5", ticked: new Set(["a"]), filter: "a" });
    server.use(http.get("/api/routing", () => HttpResponse.json({ ...state, selected: 1 })));
    const { client } = renderWithQuery(<RunBar />);
    await waitFor(() => expect(document.getElementById("routing-estimate")!.textContent).toBe("1 prompts × 3 draws = 3 model calls · about $0.04 (estimate)"));
    const button = document.getElementById("routing-run") as HTMLButtonElement;
    expect([button.textContent, button.disabled, button.dataset.action]).toEqual(["Run 1", false, "start"]);
    fireEvent.click([...document.querySelectorAll<HTMLButtonElement>("#routing-draws button")].find((b) => b.textContent === "1 · first look")!);
    expect(useRoutingStore.getState().draws).toBe(1);
    server.use(http.get("/api/routing", () => HttpResponse.json({ ...state, selected: 1, running: true, exit_code: null })));
    await client.invalidateQueries({ queryKey: ["routing"] });
    await waitFor(() => expect(button.textContent).toBe("Stop"));
    expect([button.disabled, button.dataset.action]).toEqual([false, "stop"]);
  });

  it("says when routing is not configured", async () => {
    server.use(http.get("/api/routing", () => HttpResponse.json({ available: false })));
    renderWithQuery(<RunBar />);
    await waitFor(() => expect(document.getElementById("routing-state")!.textContent).toBe("Routing not configured"));
    fireEvent.click(document.getElementById("routing-run")!);
    expect(document.querySelector(".run-bar-blocked")!.textContent).toContain("Set up the routing eval first");
  });
});

describe("RunView", () => {
  beforeEach(() => installFakeEventSource());
  beforeEach(() => useRoutingStore.setState({ model: "", filter: "", ticked: new Set(), draws: 3, live: initialLive() }));
  it("shows a run going outside a review, with its Stop, and nothing once none goes", async () => {
    server.use(
      http.get("/api/routing", () => HttpResponse.json(state)),
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
    );
    const { rerender } = renderWithQuery(<RunView hidden={false} running={false} />);
    await waitFor(() => expect(document.querySelectorAll("#case-rows tr")).toHaveLength(3));
    expect(document.getElementById("routing-live-card")).toBeNull();
    // No run bar on the library: it chooses what to export.
    expect(document.getElementById("routing-run-bar")).toBeNull();
    rerender(<RunView hidden={false} running />);
    expect(document.getElementById("routing-live-card")).not.toBeNull();
    act(() => useRoutingStore.setState({ reviewing: true }));
    expect(document.getElementById("routing-live-card")).toBeNull();
    act(() => useRoutingStore.setState({ reviewing: false }));
  });
});

describe("RunDrawer", () => {
  beforeEach(() => useRoutingStore.setState({ runOpen: null }));
  it("opens a run with its cases, filters failed ones and asks AI", async () => {
    server.use(
      http.get("/api/routing/runs/:id", () => HttpResponse.json(run)),
      http.post("/api/routing/runs/:id/suggest", () => HttpResponse.json(advice)),
    );
    renderWithQuery(<RunDrawer />);
    act(() => useRoutingStore.setState({ runOpen: run.id }));
    await waitFor(() => expect(document.querySelectorAll("#run-detail-body .run-case")).toHaveLength(3));
    expect(document.querySelector("#run-detail-body h3")!.textContent).toBe("claude-sonnet-5");
    expect(document.querySelector("#run-detail-body .run-case.failed .live-votes")!.textContent).toBe("1/3");
    fireEvent.click(document.querySelector("#run-detail-body .run-filter input")!);
    expect(document.querySelectorAll("#run-detail-body .run-case")).toHaveLength(1);
    fireEvent.click(screen.getByText("Ask AI"));
    await screen.findByText("Suggested change · recommend_books");
    expect((document.querySelector("#run-detail-body textarea") as HTMLTextAreaElement).value).toContain("names a book");
    expect(screen.getByText("Proposal ready")).toBeDisabled();
  });
});

describe("Fixing a failed case", () => {
  beforeEach(() => useRoutingStore.setState({ runOpen: null }));
  it("tries a hand-written draft on this case without touching the source, then on every test, then saves it", async () => {
    const sources = { tools: [
      { name: "recommend_books", title: "Recommend books", description: "Suggest books a reader might like.", revision: "r-rec", declared: true, path: "demo/server.py" },
      { name: "get_book", title: "Get book", description: "Details of one book.", revision: "r-get", declared: true, path: "demo/server.py" },
    ] };
    const draft = "Details of one book the reader names. Not for what to read next.";
    let saved: unknown = null;
    const started: unknown[] = [];
    const replay = { ...run, id: "2026-09-10T09-00-00-claude-sonnet-5", samples: 3, total: 1, passed: 1,
      cases: [{ ...run.cases[1]!, hits: 3, passed: true, votes: [{ tool: "recommend_books", count: 3 }], picks: ["recommend_books", "recommend_books", "recommend_books"] }] };
    server.use(
      http.get("/api/routing/runs/:id", ({ params }) => HttpResponse.json(String(params.id).startsWith("2026-09-10") ? replay : run)),
      http.get("/api/routing/descriptions", () => HttpResponse.json(sources)),
      http.post("/api/routing/descriptions/apply", async ({ request }) => { saved = await request.json(); return HttpResponse.json({ tool: "get_book", path: "demo/server.py", revision: "r-get-2" }); }),
      http.post("/api/routing/run", async ({ request }) => { started.push(await request.json()); return HttpResponse.json({ ok: true, result_path: "/results/2026-09-10T09-00-00-claude-sonnet-5.json" }); }),
    );
    renderWithQuery(<RunDrawer />);
    act(() => useRoutingStore.setState({ runOpen: run.id }));
    await waitFor(() => expect(document.querySelectorAll("#run-detail-body .run-case.failed")).toHaveLength(1));
    fireEvent.click(screen.getByText("Edit the description"));
    // The expected tool first, read from the source; the tool picked instead can be edited too.
    await waitFor(() => expect((screen.getByLabelText("New tool description") as HTMLTextAreaElement).value).toBe("Suggest books a reader might like."));
    expect(await optionsOf("edit-tool")).toEqual(["recommend_books (expected)", "get_book (picked instead)"]);
    await pickOption("edit-tool", "get_book");
    await waitFor(() => expect((screen.getByLabelText("New tool description") as HTMLTextAreaElement).value).toBe("Details of one book."));
    fireEvent.change(screen.getByLabelText("New tool description"), { target: { value: draft } });
    expect(screen.queryByText("Run all tests with it")).toBeNull();
    fireEvent.click(screen.getByText("Try it on this case"));
    // This case alone, on the run's model, with the draft in place of the source's description: nothing is written.
    await waitFor(() => expect(started[0]).toEqual({ draws: 3, filter: "", cases: ["recommend-from-title"], model: "claude-sonnet-5", descriptions: { get_book: draft } }));
    // The draft being measured stays as it is until the verdict comes back.
    expect(screen.getByLabelText("New tool description")).toHaveAttribute("readonly");
    await screen.findByText(/Passed 3\/3/, undefined, { timeout: 6000 });
    expect(saved).toBeNull();
    // Another text is another draft: the verdict and what it unlocks go until that one is tried.
    fireEvent.change(screen.getByLabelText("New tool description"), { target: { value: draft + " Edited." } });
    expect(screen.queryByText(/Passed 3\/3/)).toBeNull();
    expect(screen.queryByText("Run all tests with it")).toBeNull();
    fireEvent.change(screen.getByLabelText("New tool description"), { target: { value: draft } });
    expect(screen.getByText(/Passed 3\/3/)).toBeInTheDocument();
    // It held: every test with the same draft, its progress then its result at the foot of the panel.
    fireEvent.click(screen.getByText("Run all tests with it"));
    await waitFor(() => expect(started[1]).toEqual({ draws: 3, filter: "", model: "claude-sonnet-5", descriptions: { get_book: draft } }));
    await screen.findByText(/^Running every test with this description/);
    await screen.findByText("1 / 1 passed with this description", undefined, { timeout: 6000 });
    expect(screen.getByText("Nothing that passed before broke.")).toBeInTheDocument();
    // The drawer stays on the run the fix started from.
    expect(useRoutingStore.getState().runOpen).toBe(run.id);
    expect(saved).toBeNull();
  }, 15000);

  it("says which tests a draft broke when every test runs with it", async () => {
    const sources = { tools: [{ name: "recommend_books", title: "Recommend books", description: "Suggest books a reader might like.", revision: "r-rec", declared: true, path: "demo/server.py" }] };
    const fixed = { ...run.cases[1]!, hits: 3, passed: true, votes: [{ tool: "recommend_books", count: 3 }], picks: ["recommend_books", "recommend_books", "recommend_books"] };
    const single = { ...run, id: "2026-09-10T09-00-00-claude-sonnet-5", total: 1, passed: 1, cases: [fixed] };
    // search-topic passed in the run the fix started from: the draft pulls it away.
    const broken = { ...run.cases[0]!, hits: 0, passed: false, votes: [{ tool: "recommend_books", count: 3 }], picks: ["recommend_books", "recommend_books", "recommend_books"] };
    const all = { ...run, id: "2026-09-10T09-05-00-claude-sonnet-5", total: 3, passed: 2, cases: [broken, fixed, run.cases[2]!] };
    let starts = 0;
    server.use(
      http.get("/api/routing/runs/:id", ({ params }) => HttpResponse.json(
        String(params.id).startsWith("2026-09-10T09-00") ? single : String(params.id).startsWith("2026-09-10T09-05") ? all : run)),
      http.get("/api/routing/descriptions", () => HttpResponse.json(sources)),
      http.post("/api/routing/run", () => {
        starts += 1;
        return HttpResponse.json({ ok: true, result_path: `/results/${starts === 1 ? single.id : all.id}.json` });
      }),
    );
    renderWithQuery(<RunDrawer />);
    act(() => useRoutingStore.setState({ runOpen: run.id }));
    await waitFor(() => expect(document.querySelectorAll("#run-detail-body .run-case.failed")).toHaveLength(1));
    fireEvent.click(screen.getByText("Edit the description"));
    await waitFor(() => expect((screen.getByLabelText("New tool description") as HTMLTextAreaElement).value).toBe("Suggest books a reader might like."));
    fireEvent.change(screen.getByLabelText("New tool description"), { target: { value: "Any book, for any request." } });
    fireEvent.click(screen.getByText("Try it on this case"));
    await screen.findByText(/Passed 3\/3/, undefined, { timeout: 6000 });
    fireEvent.click(screen.getByText("Run all tests with it"));
    await screen.findByText("2 / 3 passed with this description", undefined, { timeout: 6000 });
    expect(screen.getByText("It broke search-topic: passed before, failing now.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open the report"));
    expect(useRoutingStore.getState().runOpen).toBe(all.id);
  }, 15000);

  it("saves a draft into the source only when asked", async () => {
    const sources = { tools: [{ name: "recommend_books", title: "Recommend books", description: "Suggest books a reader might like.", revision: "r-rec", declared: true, path: "demo/server.py" }] };
    let saved: unknown = null;
    server.use(
      http.get("/api/routing/runs/:id", () => HttpResponse.json(run)),
      http.get("/api/routing/descriptions", () => HttpResponse.json(sources)),
      http.post("/api/routing/descriptions/apply", async ({ request }) => { saved = await request.json(); return HttpResponse.json({ tool: "recommend_books", path: "demo/server.py", revision: "r-rec-2" }); }),
    );
    renderWithQuery(<RunDrawer />);
    act(() => useRoutingStore.setState({ runOpen: run.id }));
    await waitFor(() => expect(document.querySelectorAll("#run-detail-body .run-case.failed")).toHaveLength(1));
    fireEvent.click(screen.getByText("Edit the description"));
    await waitFor(() => expect((screen.getByLabelText("New tool description") as HTMLTextAreaElement).value).toBe("Suggest books a reader might like."));
    fireEvent.change(screen.getByLabelText("New tool description"), { target: { value: "Books like one the reader enjoyed." } });
    fireEvent.click(screen.getByText("Save to source"));
    await waitFor(() => expect(saved).toEqual({ tool: "recommend_books", revision: "r-rec", original_description: "Suggest books a reader might like.",
      suggested_description: "Books like one the reader enjoyed." }));
    await screen.findByText("Saved in demo/server.py. Every run now reads it.");
  });
});
