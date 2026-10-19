import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect } from "vitest";
import { useRoutingStore } from "@/stores/routing.store";
import { initialLive } from "@/stores/routing-live";
import { installFakeEventSource } from "./fake-event-source";
import { server } from "./msw";

// The proposals' run, as the console answers it: started, then finished with its report written.
export function proposalsRunServer(started: unknown[] = []) {
  installFakeEventSource();
  server.use(
    http.get("/api/routing", () => HttpResponse.json({ available: true, running: false, total: 0, selected: 0, models: [] })),
    http.post("/api/routing/run", async ({ request }) => { started.push(await request.json()); return HttpResponse.json({ ok: true, result_path: "/r/proposed.json" }); }),
    http.get("/api/routing/runs/:id", () => HttpResponse.json({ id: "proposed", provider: "anthropic", model: "claude-sonnet-5", samples: 1,
      usage: {}, total: 1, passed: 1, result_mtime: 0, cost: 0.01, proposed: true, drafts: {},
      cases: [{ id: "p", prompt: "p", expect: "t", hits: 1, passed: true, votes: [], picks: ["t"] }] })),
  );
  return started;
}

// Runs the ticked proposals and lets the run finish: the button that keeps them is at the foot of its report.
export async function runProposalsToTheEnd(label: string): Promise<void> {
  // A run needs a model: the one the user would have picked, if the test has not.
  if (!useRoutingStore.getState().model) act(() => useRoutingStore.setState({ model: "claude-sonnet-5" }));
  fireEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(document.getElementById("proposals-run")).not.toBeNull());
  act(() => useRoutingStore.setState({ live: { ...initialLive(), runId: "/r/proposed.json", total: 1, completed: 1, progress: 1 } }));
}
