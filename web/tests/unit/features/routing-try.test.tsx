import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import CaseDialog from "@/features/routing/cases/CaseDialog";
import CasesView from "@/features/routing/cases/CasesView";
import { useRoutingStore } from "@/stores/routing.store";
import catalog from "../../fixtures/routing-catalog.json";
import generated from "../../fixtures/routing-generate.json";
import { installFakeEventSource } from "../support/fake-event-source";
import { server } from "../support/msw";
import { openAddTest } from "../support/add-test";
import { renderWithQuery } from "../support/query";
import { pickOption, selectValue } from "../support/select";

// Every prompt sent is routed to list_genres, except one asking for "brands".
const routeAll = (asked: unknown[]) => http.post("/api/routing/try", async ({ request }) => {
  const body = await request.json() as { draws: number; cases: { id: string; prompt: string; expect: string }[] };
  asked.push(body);
  const results = body.cases.map((c) => {
    const pick = c.prompt.includes("brands") ? "search_books" : "list_genres";
    return { id: c.id, expect: c.expect, picks: Array(body.draws).fill(pick), passed: pick === c.expect };
  });
  // Slow enough for the progress bar to be seen.
  await new Promise((done) => setTimeout(done, 50));
  return HttpResponse.json({ model: "claude-sonnet-5", draws: body.draws, results, cost: 0.014 * results.length });
});

const open = async () => {
  renderWithQuery(<><CasesView hidden={false} /><CaseDialog /></>);
  await openAddTest("list_genres");
};

describe("Try, before a test is saved", () => {
  // The proposals' run streams its log as any run does.
  beforeEach(() => { installFakeEventSource(); useRoutingStore.setState({ caseDialog: null, model: "claude-sonnet-5", proposals: null, adding: false }); });

  it("tries the proposals as a run of them, unsaved, its report under the bar", async () => {
    let started: { proposed?: unknown[]; model?: string; draws?: number } | null = null;
    let saved = false;
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
      http.post("/api/routing/catalog/generate", () => HttpResponse.json(generated)),
      http.put("/api/routing/catalog", () => { saved = true; return HttpResponse.json(catalog); }),
      http.get("/api/routing", () => HttpResponse.json({ available: true, running: false, total: 3, selected: 0, models: [] })),
      http.post("/api/routing/run", async ({ request }) => { started = (await request.json()) as typeof started; return HttpResponse.json({ ok: true, result_path: "/r/run.json" }); }),
    );
    await open();
    fireEvent.click(document.getElementById("case-generate")!);
    await waitFor(() => expect(document.querySelectorAll("#case-proposals .ai-proposal")).toHaveLength(2));
    const [first, second] = [...document.querySelectorAll("#case-proposals .ai-proposal")];
    fireEvent.change(second!.querySelector("textarea")!, { target: { value: "Rank the brands for me." } });
    // Each proposal names the tool it should reach, with a box that puts it in the run; no id field.
    expect(first!.querySelector(".ai-proposal-target")!.textContent).toContain("list_genres");
    expect(document.querySelector("#case-proposals input:not([type=checkbox])")).toBeNull();
    // One box ticks or unticks them all; Draws explains itself behind a "?".
    fireEvent.click(document.getElementById("proposals-all")!);
    expect(screen.getByRole("button", { name: "Run 0 tests" })).not.toBeNull();
    fireEvent.click(document.getElementById("proposals-all")!);
    expect(screen.getByRole("button", { name: "What are draws?" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run 2 tests" }));

    await waitFor(() => expect(started).not.toBeNull());
    expect(started).toMatchObject({ model: "claude-sonnet-5", draws: 1, proposed: [generated.cases[0], { ...generated.cases[1], prompt: "Rank the brands for me." }] });
    // Its progress, logs and report land here, under the bar.
    await waitFor(() => expect(document.getElementById("proposals-run")).not.toBeNull());
    expect(document.getElementById("case-dialog")!.hasAttribute("open")).toBe(true);
    expect(saved).toBe(false);
  });

  it("tries the test written by hand at the top, without saving it", async () => {
    const asked: unknown[] = [];
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
      routeAll(asked),
    );
    await open();
    // Pressable with nothing typed: the click says what is missing, and asks no model.
    fireEvent.click(document.getElementById("case-try")!);
    expect(document.getElementById("case-try-missing")!.textContent).toBe("Type a prompt first.");
    expect(asked).toEqual([]);
    fireEvent.change(document.getElementById("case-prompt")!, { target: { value: "Which brands lead?" } });
    fireEvent.click(document.getElementById("case-try")!);
    expect(document.getElementById("case-try-progress")).not.toBeNull();
    await waitFor(() => expect(document.querySelector("#case-dialog > .try-verdicts")).not.toBeNull());
    expect(document.querySelector("#case-dialog > .try-verdicts")!.textContent).toBe("✗ routes to search_books, not list_genres (0/1) · Claude Sonnet 5");
    expect((asked[0] as { cases: { prompt: string }[] }).cases[0]!.prompt).toBe("Which brands lead?");
  });

  it("tries three times on demand and says the vote; with no model chosen it asks for one", async () => {
    const asked: { draws: number }[] = [];
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
      routeAll(asked),
    );
    useRoutingStore.setState({ model: "" });
    await open();
    fireEvent.change(document.getElementById("case-prompt")!, { target: { value: "What categories exist?" } });
    const tryButton = document.getElementById("case-try") as HTMLButtonElement;
    expect([tryButton.disabled, tryButton.textContent]).toEqual([false, "Try"]);
    fireEvent.click(tryButton);
    expect(document.getElementById("case-try-missing")!.textContent).toBe("Choose a model to try it with first.");
    await pickOption("case-try-model", "claude-sonnet-5");
    fireEvent.click(screen.getByText("3 · majority"));
    fireEvent.click(document.getElementById("case-try")!);
    await waitFor(() => expect(document.querySelector("#case-dialog > .try-verdicts")).not.toBeNull());
    expect(asked[0]!.draws).toBe(3);
    // A second try adds its line under the first.
    fireEvent.click(screen.getByText("1 · first look"));
    fireEvent.click(document.getElementById("case-try")!);
    await waitFor(() => expect(document.querySelectorAll("#case-dialog > .try-verdicts .try-verdict")).toHaveLength(2));
    expect([...document.querySelectorAll("#case-dialog > .try-verdicts .try-verdict")].map((p) => p.textContent)).toEqual([
      "✓ routes to list_genres (3/3) · Claude Sonnet 5", "✓ routes to list_genres (1/1) · Claude Sonnet 5"]);
    expect(document.getElementById("case-try-progress")).toBeNull();
  });

  it("shares one model between the hand-written Try and the proposals' run", async () => {
    let started: { model?: string; draws?: number; proposed?: unknown[] } | null = null;
    server.use(
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
      http.post("/api/routing/catalog/generate", () => HttpResponse.json(generated)),
      http.get("/api/routing", () => HttpResponse.json({ available: true, running: false, total: 3, selected: 0, models: [] })),
      http.post("/api/routing/run", async ({ request }) => { started = (await request.json()) as typeof started; return HttpResponse.json({ ok: true, result_path: "/r/run.json" }); }),
    );
    await open();
    fireEvent.click(document.getElementById("case-generate")!);
    await waitFor(() => expect(document.querySelectorAll("#case-proposals .ai-proposal")).toHaveLength(2));
    await pickOption("case-try-proposals-model", "claude-opus-5");
    fireEvent.click(document.querySelector("#case-try-proposals-draws button:last-child")!);
    // Picked once: the hand-written Try follows, so nobody picks it twice.
    expect(selectValue("case-try-model")).toBe("claude-opus-5");
    // An unticked test stays, and stays out of the run.
    fireEvent.click(document.querySelectorAll<HTMLInputElement>("#case-proposals .ai-proposal input[type=checkbox]")[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Run 1 test" }));
    await waitFor(() => expect(started).not.toBeNull());
    expect([started!.model, started!.draws, started!.proposed!.length]).toEqual(["claude-opus-5", 3, 1]);
  });
});
