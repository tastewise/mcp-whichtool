import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import RunView from "@/features/routing/run/RunView";
import CasesView from "@/features/routing/cases/CasesView";
import { useKeysPanel } from "@/features/keys/keys-panel.store";
import { useRoutingStore } from "@/stores/routing.store";
import { initialLive } from "@/stores/routing-live";
import { server } from "../support/msw";
import { renderWithQuery } from "../support/query";
import { proposalsRunServer, runProposalsToTheEnd } from "../support/proposals-run";
import { pickOption } from "../support/select";

const TOOLS = [{ name: "search_flights", title: "search_flights" }, { name: "book_hotel", title: "Hotels" }];
const EMPTY = { revision: "r1", cases: [], tools: TOOLS };
const PROPOSED: Record<string, { id: string; prompt: string; expect: string }[]> = {
  search_flights: [{ id: "flights-rome", prompt: "Flights to Rome on Friday?", expect: "search_flights" }],
  // The second tool's batch repeats the first's prompt: it is dropped, not offered twice.
  book_hotel: [{ id: "hotel-lyon", prompt: "A room in Lyon for two nights", expect: "book_hotel" },
    { id: "hotel-dup", prompt: "flights to rome on friday?", expect: "book_hotel" }],
};

describe("An empty test library", () => {
  beforeEach(() => useRoutingStore.setState({ ticked: new Set(), filter: "", caseSearch: "", caseTool: "", casePage: 1, writer: "", perTool: 6, proposals: null, adding: false }));

  it("shows no run bar until there is a test to run", async () => {
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(EMPTY)),
      http.get("/api/routing", () => HttpResponse.json({ available: true, running: false, total: 0, selected: 0, models: [] })),
    );
    renderWithQuery(<RunView hidden={false} running={false} />);
    expect(await screen.findByText("Add your first tests")).not.toBeNull();
    expect(document.getElementById("routing-model")).toBeNull();
  });

  it("says what a test is, has AI write tests for every tool, and adds the ones kept", async () => {
    let saved: unknown = null;
    const asked: string[] = [];
    server.use(
      http.get("/api/keys", () => HttpResponse.json({ anthropic: false, openai: true })),
      http.get("/api/routing/catalog", () => HttpResponse.json(EMPTY)),
      http.post("/api/routing/catalog/generate", async ({ request }) => {
        const { tool, model, count } = (await request.json()) as { tool: string; model: string; count: number };
        asked.push(`${tool}:${model}:${count}`);
        return HttpResponse.json({ cases: PROPOSED[tool], model: "claude-opus-5-5", cost: 0.002 });
      }),
      http.put("/api/routing/catalog", async ({ request }) => {
        saved = await request.json();
        const { cases } = saved as { cases: unknown[] };
        return HttpResponse.json({ ...EMPTY, revision: "r2", cases });
      }),
    );
    renderWithQuery(<CasesView hidden={false} />);
    expect(await screen.findByText("Add your first tests")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add a test" })).not.toBeNull();

    // A model the user picks writes them: OpenAI here, its key held by this machine.
    await pickOption("write-tests-model", "gpt-6-sol");
    // Six per tool unless the user says otherwise.
    expect((document.getElementById("write-tests-count") as HTMLInputElement).value).toBe("6");
    fireEvent.change(document.getElementById("write-tests-count")!, { target: { value: "3" } });
    const start = await screen.findByRole("button", { name: "Write tests for 2 tools" });
    fireEvent.click(start);
    expect(await screen.findByText("2 tests proposed")).not.toBeNull();
    expect(asked).toEqual(["search_flights:gpt-6-sol:3", "book_hotel:gpt-6-sol:3"]);
    // Under review, the proposals are the page: the introduction and the other way step aside.
    expect(document.getElementById("get-started")!.dataset.active).toBe("yes");
    expect([...document.querySelectorAll(".ai-proposal-target .mono")].map((tool) => tool.textContent)).toEqual(["search_flights", "book_hotel"]);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove this test" })[1]!);
    // Keeping is the end of the process: the button waits at the foot of the run's report.
    expect(screen.queryByRole("button", { name: /^Keep/ })).toBeNull();
    proposalsRunServer();
    await runProposalsToTheEnd("Run 1 test");
    const keep = await screen.findByRole("button", { name: "Keep this test" });
    // Keep and the report side by side, at the foot of the run: the report's own button is not repeated above.
    expect([...document.querySelectorAll(".proposals-keep button")].map((button) => button.textContent)).toEqual(["Keep this test", "Open the report"]);
    expect(document.getElementById("live-open")).toBeNull();
    fireEvent.click(keep);
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved).toEqual({ revision: "r1", cases: [PROPOSED.search_flights![0]] });
  });

  it("keeps what ran, and leads back from the library to the proposals not kept", async () => {
    let current: { revision: string; cases: unknown[]; tools: typeof TOOLS } = EMPTY;
    server.use(
      http.get("/api/keys", () => HttpResponse.json({ anthropic: true, openai: false })),
      http.get("/api/routing/catalog", () => HttpResponse.json(current)),
      http.post("/api/routing/catalog/generate", async ({ request }) => {
        const { tool } = (await request.json()) as { tool: string };
        return HttpResponse.json({ cases: PROPOSED[tool]!.slice(0, 1), model: "claude-opus-5-5", cost: 0.002 });
      }),
      http.put("/api/routing/catalog", async ({ request }) => {
        const { cases } = (await request.json()) as { cases: unknown[] };
        current = { ...EMPTY, revision: "r2", cases };
        return HttpResponse.json(current);
      }),
    );
    renderWithQuery(<CasesView hidden={false} />);
    const start = await screen.findByRole("button", { name: "Write tests for 2 tools" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add an Anthropic key" })).toBeNull());
    fireEvent.click(start);
    expect(await screen.findByText("2 tests proposed")).not.toBeNull();
    // The hotel's test is left out of the run: only what ran can be kept.
    fireEvent.click(document.querySelectorAll<HTMLButtonElement>(".ai-proposal [role='checkbox'], .ai-proposal input[type='checkbox']")[1]!);
    proposalsRunServer();
    await runProposalsToTheEnd("Run 1 test");
    fireEvent.click(await screen.findByRole("button", { name: "Keep this test" }));

    // The library, with the way back to what was not kept.
    const back = await screen.findByRole("button", { name: "← Back to the proposals (1)" });
    expect(document.getElementById("case-status")!.textContent).toContain("1 prompts");
    fireEvent.click(back);
    expect(await screen.findByText("1 test proposed")).not.toBeNull();
    expect([...document.querySelectorAll(".ai-proposal-target .mono")].map((tool) => tool.textContent)).toEqual(["book_hotel"]);
    // And forth, to the library.
    fireEvent.click(screen.getByRole("button", { name: "Test library · 1 test →" }));
    expect(await screen.findByRole("button", { name: "← Back to the proposals (1)" })).not.toBeNull();
  });

  it("keeps a finished run of the proposals across a trip to the library, and adds by hand for the tool without a test", async () => {
    const flight = { id: "flights-paris", prompt: "Flights to Paris?", expect: "search_flights" };
    server.use(
      http.get("/api/keys", () => HttpResponse.json({ anthropic: true, openai: false })),
      http.get("/api/routing/catalog", () => HttpResponse.json({ ...EMPTY, cases: [flight] })),
      http.post("/api/routing/catalog/generate", () => HttpResponse.json({ cases: PROPOSED.book_hotel!.slice(0, 1), model: "claude-opus-5-5", cost: 0.002 })),
    );
    renderWithQuery(<CasesView hidden={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "← Add tests" }));
    // Only the tool without a test is offered, by AI and by hand.
    fireEvent.click(await screen.findByRole("button", { name: "Add a test" }));
    expect(useRoutingStore.getState().caseDialog?.initial.expect).toBe("book_hotel");
    const start = await screen.findByRole("button", { name: "Write tests for 1 tool" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add an Anthropic key" })).toBeNull());
    fireEvent.click(start);
    expect(await screen.findByText("1 test proposed")).not.toBeNull();
    proposalsRunServer();
    await runProposalsToTheEnd("Run 1 test");
    expect(await screen.findByRole("button", { name: "Keep this test" })).not.toBeNull();

    // To the library and back: the run is still theirs, Keep and its report with it, nothing to pay twice.
    fireEvent.click(screen.getByRole("button", { name: "Test library · 1 test →" }));
    fireEvent.click(await screen.findByRole("button", { name: "← Back to the proposals (1)" }));
    expect(await screen.findByRole("button", { name: "Keep this test" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open the report" })).not.toBeNull();
  });

  it("says a stopped run of the proposals stopped, with no report to wait for", async () => {
    server.use(
      http.get("/api/keys", () => HttpResponse.json({ anthropic: true, openai: false })),
      http.get("/api/routing/catalog", () => HttpResponse.json(EMPTY)),
      http.post("/api/routing/catalog/generate", async ({ request }) => {
        const { tool } = (await request.json()) as { tool: string };
        return HttpResponse.json({ cases: PROPOSED[tool]!.slice(0, 1), model: "claude-opus-5-5", cost: 0.002 });
      }),
      http.get("/api/routing/runs/:id", () => HttpResponse.json({ detail: "No such run" }, { status: 404 })),
    );
    renderWithQuery(<CasesView hidden={false} />);
    const start = await screen.findByRole("button", { name: "Write tests for 2 tools" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add an Anthropic key" })).toBeNull());
    fireEvent.click(start);
    expect(await screen.findByText("2 tests proposed")).not.toBeNull();
    proposalsRunServer();
    server.use(http.get("/api/routing/runs/:id", () => HttpResponse.json({ detail: "No such run" }, { status: 404 })));
    useRoutingStore.setState({ model: "claude-sonnet-5" });
    fireEvent.click(screen.getByRole("button", { name: "Run 2 tests" }));
    await waitFor(() => expect(document.getElementById("proposals-run")).not.toBeNull());
    // The eval was stopped: it wrote no report.
    act(() => useRoutingStore.setState({ live: { ...initialLive(), runId: "/r/stopped.json", total: 2, completed: 1, progress: 1, title: "Evaluation stopped", stopped: true } }));
    expect(await screen.findByText("Evaluation stopped")).not.toBeNull();
    expect(screen.queryByText("Reading the report…")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Keep/ })).toBeNull();
  });

  it("shows the prompt that writes the tests, with the count chosen", async () => {
    const asked: unknown[] = [];
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(EMPTY)),
      http.post("/api/routing/catalog/generate/prompt", async ({ request }) => {
        asked.push(await request.json());
        return HttpResponse.json({ system: "You review the tool descriptions.", prompt: "Write 6 requests that should reach `search_flights`.", recommended: 6, max: 15 });
      }),
    );
    renderWithQuery(<CasesView hidden={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "See the prompt" }));
    expect((await screen.findByText("Write 6 requests that should reach `search_flights`.")).id).toBe("writing-prompt-request");
    expect(document.getElementById("writing-prompt-system")!.textContent).toBe("You review the tool descriptions.");
    expect(asked).toEqual([{ tool: "search_flights", scenario: "", count: 6 }]);
  });

  it("says which tools a Stop left without proposals, and drops repeats the server would refuse", async () => {
    let release: () => void = () => {};
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(EMPTY)),
      http.post("/api/routing/catalog/generate", async ({ request }) => {
        const { tool } = (await request.json()) as { tool: string };
        if (tool === "book_hotel") await new Promise<void>((resolve) => { release = resolve; });
        return HttpResponse.json({ model: "m", cost: 0, cases: [
          { id: "flights-rome", prompt: "Flights to Rome?", expect: tool },
          { id: " Flights-Rome ", prompt: "  flights to rome?  ", expect: tool }] });
      }),
      http.post("/api/routing/ai/stop", () => { release(); return HttpResponse.json({ stopped: true }); }),
    );
    renderWithQuery(<CasesView hidden={false} />);
    const start = await screen.findByRole("button", { name: "Write tests for 2 tools" });
    // Once the machine's key is known: before, the click would ask for one.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add an Anthropic key" })).toBeNull());
    fireEvent.click(start);
    // The tool being written for, in a chip, and how far along: no trailing dots.
    await waitFor(() => expect(document.querySelector(".tool-chip")?.textContent).toBe("Hotels"));
    expect(document.querySelector(".write-tests-now")!.textContent).toBe("Writing tests for Hotels2 of 2");
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));

    expect(await screen.findByText("1 test proposed")).not.toBeNull();
    expect(screen.getByText(/for 1 tool/)).not.toBeNull();
    expect(screen.getByText("No proposal for book_hotel: add those by hand.")).not.toBeNull();
  });

  it("asks for an API key before AI can write anything", async () => {
    server.use(
      http.get("/api/keys", () => HttpResponse.json({ anthropic: false, openai: false })),
      http.get("/api/routing/catalog", () => HttpResponse.json(EMPTY)),
    );
    renderWithQuery(<CasesView hidden={false} />);
    expect(await screen.findByRole("button", { name: "Add an Anthropic key" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    // Pressable: the click says what is missing and opens where the key goes.
    fireEvent.click(screen.getByRole("button", { name: "Write tests for 2 tools" }));
    expect(useKeysPanel.getState().open).toBe(true);
    // Only once Write is pressed: a box that says what stands in the way.
    expect(screen.getByRole("alert").textContent).toMatch(/needs an API key: add one in the panel that just opened\.$/);
  });
});
