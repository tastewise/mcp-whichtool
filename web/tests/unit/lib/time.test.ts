import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ago, costLabel, dateLabel, remaining } from "@/lib/time";

describe("ago", () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000_000 * 1000 }));
  afterEach(() => vi.useRealTimers());
  it("says never without a stamp", () => expect(ago(0)).toBe("never"));
  it("counts seconds, minutes, hours, days", () => {
    expect(ago(1_000_000_000 - 5)).toBe("5s ago");
    expect(ago(1_000_000_000 - 120)).toBe("2 min ago");
    expect(ago(1_000_000_000 - 7200)).toBe("2h ago");
    expect(ago(1_000_000_000 - 172800)).toBe("2d ago");
  });
  it("never goes negative", () => expect(ago(1_000_000_000 + 60)).toBe("0s ago"));
});

describe("remaining", () => {
  it("matches ui.js", () => {
    expect(remaining(0)).toBe("expired");
    expect(remaining(120)).toBe("2 min left");
    expect(remaining(7200)).toBe("2h left");
    expect(remaining(172800)).toBe("2d left");
  });
});

describe("labels", () => {
  it("prices in USD and says when nothing is priced", () => {
    expect(costLabel(null)).toBe("Not priced");
    expect(costLabel(1.5)).toMatch(/1\.50/);
  });
  it("says when a date is missing", () => expect(dateLabel(0)).toBe("Time unavailable"));
});
