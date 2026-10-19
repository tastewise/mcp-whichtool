import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("joins and drops falsy", () => {
    const off = Date.now() < 0;
    expect(cn("small", off && "x", "primary")).toBe("small primary");
  });
});
