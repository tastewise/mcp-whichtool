import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { DOCS, parseDoc, routeOf } from "@/features/docs/docs.model";
import DocsPage from "@/pages/DocsPage";
import { server } from "../support/msw";
import { testQueryClient } from "../support/query";

const at = (path: string) => {
  server.use(http.get("/api/keys", () => HttpResponse.json({ anthropic: false, openai: false })));
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/docs" element={<DocsPage />} /><Route path="/docs/:slug" element={<DocsPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("The guides", () => {
  it("are docs/guides, in their files' order, named by their titles", () => {
    expect(DOCS.map((doc) => [doc.slug, doc.title])).toEqual([
      ["naming-and-describing-tools", "Naming and describing tools"],
      ["testing-routing", "Testing routing"],
      ["exporting-your-tests", "Exporting your tests"],
      ["your-keys-and-your-tools", "Your keys and your tools"],
    ]);
  });

  it("list their sections, never a comment in a code block", () => {
    const doc = parseDoc("x/03-a.md", "# A\n\n## One `code`\n\n```sh\n# not a section\n```\n\n### Two, three\n");
    expect(doc).toMatchObject({ slug: "a", file: "03-a.md", title: "A" });
    expect(doc.headings).toEqual([{ id: "one-code", text: "One code", level: 2 }, { id: "two-three", text: "Two, three", level: 3 }]);
  });

  it("link to each other within the page, and to the web outside it", () => {
    expect(routeOf("02-testing-routing.md#draws")).toBe("/docs/testing-routing#draws");
    expect(routeOf("https://modelcontextprotocol.io/x.md")).toBeUndefined();
    expect(routeOf("#tool-names")).toBeUndefined();
  });
});

describe("The Docs page", () => {
  it("opens on the first guide, with its sections beside it, and follows a link to the next", async () => {
    at("/docs");
    expect(await screen.findByRole("heading", { level: 1, name: "Naming and describing tools" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Docs", current: "page" })).not.toBeNull();
    const side = screen.getByRole("navigation", { name: "Docs" });
    expect(side.querySelector('a[href="#describing-a-tool"]')!.textContent).toBe("Describing a tool");
    // Sources open outside; a guide opens here.
    expect(screen.getAllByRole("link", { name: /Writing effective tools/ })[0]!.getAttribute("target")).toBe("_blank");
    // The guide's own link to the next one, written as on GitHub, opens it in the page.
    const next = [...document.querySelectorAll<HTMLAnchorElement>("#doc a")].find((link) => link.textContent === "Testing routing")!;
    expect(next.getAttribute("href")).toBe("/docs/testing-routing");
    fireEvent.click(next);
    expect(await screen.findByRole("heading", { level: 1, name: "Testing routing" })).not.toBeNull();
  });

  it("opens on a section, and survives a hash that names none", async () => {
    at("/docs/testing-routing#%");
    expect(await screen.findByRole("heading", { level: 1, name: "Testing routing" })).not.toBeNull();
  });

  it("says so for a guide that does not exist", async () => {
    at("/docs/nothing-here");
    expect(await screen.findByText('No guide called "nothing-here".')).not.toBeNull();
  });
});
