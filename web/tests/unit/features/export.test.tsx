import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CasesView from "@/features/routing/cases/CasesView";
import { useRoutingStore } from "@/stores/routing.store";
import catalog from "../../fixtures/routing-catalog.json";
import { server } from "../support/msw";
import { renderWithQuery } from "../support/query";

const SHOP = { configured: true, folder: "/w/shop", file: "/w/shop/whichtool.toml", name: "shop", server: "", routing: true, uploaded: false, demo: false, fingerprint: "x" };

// The Export button opens its choices; one of them is picked.
async function choose(button: string, option: RegExp | string) {
  fireEvent.keyDown(await screen.findByRole("button", { name: button }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: option }));
}

describe("Export", () => {
  beforeEach(() => useRoutingStore.setState({ ticked: new Set(), filter: "", adding: false, proposals: null }));

  it("downloads the tests as a kit for CI, or alone as JSON, named after the project", async () => {
    let asked = 0;
    let query = "";
    server.use(
      http.get("/api/project", () => HttpResponse.json(SHOP)),
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
      http.get("/api/routing/export", ({ request }) => { asked += 1; query = new URL(request.url).search; return new HttpResponse(new Uint8Array([80, 75, 3, 4]), { headers: { "content-type": "application/zip" } }); }),
    );
    URL.createObjectURL = vi.fn(() => "blob:kit");
    URL.revokeObjectURL = vi.fn();
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.download); });
    renderWithQuery(<CasesView hidden={false} />);
    await waitFor(() => expect(document.querySelectorAll("#case-rows tr").length).toBeGreaterThan(0));

    // Export is a choice: the kit for CI, or the tests alone.
    await choose("Export all 3 tests", /Kit for your CI/);
    await waitFor(() => expect(clicked).toEqual(["routing-tests-shop.zip"]));
    expect([asked, query]).toEqual([1, "?format=kit"]);
    await choose("Export all 3 tests", /Tests only/);
    await waitFor(() => expect(clicked).toEqual(["routing-tests-shop.zip", "routing-tests-shop.json"]));
    expect(query).toBe("?format=json");
    // Ticked tests are the ones exported.
    fireEvent.click(document.querySelectorAll<HTMLInputElement>("td.casetick input")[0]!);
    await choose("Export 1 test", /Tests only/);
    await waitFor(() => expect(asked).toBe(3));
    expect(query).toBe(`?format=json&cases=${catalog.cases[0]!.id}`);
  });

  it("leads to the guide on which export to choose", async () => {
    server.use(
      http.get("/api/project", () => HttpResponse.json(SHOP)),
      http.get("/api/routing/catalog", () => HttpResponse.json(catalog)),
    );
    renderWithQuery(<Routes><Route path="/" element={<CasesView hidden={false} />} /><Route path="/docs/:slug" element={<p>guide</p>} /></Routes>);
    await choose("Export all 3 tests", "Which one, and how to use it");
    expect(await screen.findByText("guide")).not.toBeNull();
  });
});
