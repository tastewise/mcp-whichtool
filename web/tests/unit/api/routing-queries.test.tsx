import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRoutingState } from "@/api/queries/routing";
import state from "../../fixtures/routing-state.json";
import { server } from "../support/msw";
import { testQueryClient } from "../support/query";

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={testQueryClient()}>{children}</QueryClientProvider>;

describe("routing queries", () => {
  it("passes filter and model like refreshRouting", async () => {
    let asked = "";
    server.use(http.get("/api/routing", ({ request }) => { asked = new URL(request.url).search; return HttpResponse.json(state); }));
    const { result } = renderHook(() => useRoutingState("order", "claude-opus-5"), { wrapper });
    await waitFor(() => expect(result.current.data?.total).toBe(141));
    expect(asked).toBe("?filter=order&model=claude-opus-5");
  });
});
