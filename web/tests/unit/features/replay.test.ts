import { describe, expect, it } from "vitest";
import type { RunCase } from "@/api/types/routing";
import { runIdOf, verdict } from "@/features/routing/advice/replay";

const row = (over: Partial<RunCase>): RunCase =>
  ({ id: "ret-a", prompt: "?", expect: "check_stock", hits: 0, passed: false, votes: [], picks: [], ...over });

describe("replay", () => {
  it("takes the run id from the path the run reports", () => {
    expect(runIdOf("/results/2026-09-23T10-00-00.json")).toBe("2026-09-23T10-00-00.json");
    expect(runIdOf("2026-09-23T10-00-00.json")).toBe("2026-09-23T10-00-00.json");
  });

  it("says what the replay settled, and what it picked instead", () => {
    expect(verdict(row({ hits: 3, passed: true }), 3, "check_stock"))
      .toBe("Passed 3/3 — the router picks check_stock now.");
    expect(verdict(row({ hits: 1, picks: ["search_books", "search_books"] }), 3, "check_stock"))
      .toBe("Still failing: 1/3, it picked search_books.");
    expect(verdict(row({ picks: [] }), 3, "check_stock")).toBe("Still failing: 0/3.");
  });
});
