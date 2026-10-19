import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import RoutingPage from "@/pages/RoutingPage";
import ScanPage from "@/pages/ScanPage";
import { server } from "../support/msw";
import { renderWithQuery, testQueryClient } from "../support/query";

const App = () => <Routes><Route path="/" element={<ScanPage />} /><Route path="/routing" element={<RoutingPage />} /></Routes>;
const NONE = { configured: false, folder: "/work", fingerprint: "x" };
const OPEN = { configured: true, folder: "/work/shop", file: "/work/shop/whichtool.toml", name: "shop", server: "", routing: true, uploaded: true, demo: false, fingerprint: "x" };
const SCANNED = {
  root: "/home/.whichtool/uploads/shop-1a2b3c", server: "", descriptions: "shop", offered: 2, project: "x", exists: false, uploaded: true,
  tools: [
    { name: "search_books", title: "Search", description: "Search the catalogue.", path: "shop/server.ts", listed: false, params: [] },
    { name: "track_order", title: "track_order", description: "", path: "shop/server.ts", listed: false, params: [] },
  ],
};

function recorded() {
  const asked: { path: string; body: unknown }[] = [];
  let opened = false;
  server.use(
    http.get("/api/project", () => HttpResponse.json(opened ? OPEN : NONE)),
    http.post("/api/project/upload", async ({ request }) => {
      asked.push({ path: "upload", body: await request.json() });
      return HttpResponse.json(SCANNED);
    }),
    http.post("/api/project/scan", async ({ request }) => {
      asked.push({ path: "scan", body: await request.json() });
      return HttpResponse.json({ ...SCANNED, uploaded: false, root: "/work/shop" });
    }),
    http.post("/api/project", async ({ request }) => {
      asked.push({ path: "open", body: await request.json() });
      opened = true;
      return HttpResponse.json({ ...OPEN, catalog: { revision: "r", cases: [], tools: SCANNED.tools } });
    }),
    // Slow, as a server's tools/list can be: the page must not wait on it to open.
    http.get("/api/routing/catalog", async () => { await delay(10_000); return HttpResponse.json({ revision: "r", cases: [], tools: SCANNED.tools }); }),
    http.get("/api/routing", () => HttpResponse.json({ available: true, running: false, total: 0, selected: 0, models: [] })),
  );
  return asked;
}

describe("ProjectSetup", () => {
  it("scans the files picked as soon as they are picked, and opens the project only when asked", async () => {
    const asked = recorded();
    renderWithQuery(<App />);
    const picker = await screen.findByLabelText("Browse your files");
    // Where the code goes, said before it is dropped.
    expect(document.getElementById("setup-privacy")!.textContent).toContain("never sent to us");
    expect(screen.getByRole("link", { name: "What goes where" }).getAttribute("href")).toBe("/docs/your-keys-and-your-tools");
    const files = [new File(["server.tool('search_books', 'Search.')"], "server.ts"), new File(["# notes"], "README.md")];
    fireEvent.change(picker, { target: { files } });

    await waitFor(() => expect(document.querySelectorAll("#setup-tools tr")).toHaveLength(2));
    // What is not a source never leaves the disk.
    expect(asked).toEqual([{ path: "upload", body: { name: "server", server: "", files: [{ path: "server.ts", content: "server.tool('search_books', 'Search.')" }] } }]);
    // The zone steps aside for a Clear button; the count says which file.
    expect(document.getElementById("setup-drop")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear" })).not.toBeNull();
    expect(document.getElementById("setup-count")!.textContent).toBe("2 tools found in server.ts");
    expect(document.getElementById("setup-no-server")).not.toBeNull();
    // Files dropped are the way in: the URL form steps aside.
    expect(document.getElementById("setup-server")).toBeNull();
    expect(document.querySelectorAll("#setup-tools tr")[1]!.textContent).toContain("no description");

    fireEvent.click(screen.getByRole("button", { name: "Test these tools →" }));
    // The tests page opens on what its tests are: the welcome, never an empty library with a run bar first.
    await waitFor(() => expect(document.querySelector(".sec-routing")).not.toBeNull());
    expect(document.getElementById("get-started")).not.toBeNull();
    expect(document.getElementById("routing-run-bar")).toBeNull();
    expect(asked.at(-1)).toEqual({ path: "open", body: { folder: SCANNED.root, server: "" } });
  });

  it("scans a server by its URL alone", async () => {
    const asked = recorded();
    renderWithQuery(<App />);
    const scan = await screen.findByRole("button", { name: "Scan" });
    fireEvent.click(scan);
    expect(await screen.findByText("Type the server's URL first, or drop its files above.")).not.toBeNull();
    expect(asked).toEqual([]);
    fireEvent.change(screen.getByLabelText("Server URL"), { target: { value: " https://tools.example.com/mcp " } });
    fireEvent.click(scan);
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]).toEqual({ path: "upload", body: { name: "", server: "https://tools.example.com/mcp", files: [] } });
  });

  it("opens the demo, its tests ready", async () => {
    let demo = false;
    server.use(
      http.get("/api/project", () => HttpResponse.json(demo ? { ...OPEN, name: "demo", demo: true } : NONE)),
      http.post("/api/project/demo", () => { demo = true; return HttpResponse.json({ ...OPEN, name: "demo", demo: true }); }),
      http.get("/api/routing/catalog", () => HttpResponse.json({ revision: "r", cases: [], tools: [] })),
    );
    renderWithQuery(<App />);
    expect(document.body.textContent).not.toContain("folder on this machine");
    fireEvent.click(await screen.findByRole("button", { name: "Try a demo" }));
    await waitFor(() => expect(document.getElementById("routing-library")).not.toBeNull());
    expect(demo).toBe(true);
  });

  it("opens one project at a time: the demo waits while the scan's project opens", async () => {
    let opens = 0;
    server.use(
      http.get("/api/project", () => HttpResponse.json(NONE)),
      http.post("/api/project/upload", () => HttpResponse.json(SCANNED)),
      http.post("/api/project", async () => { opens += 1; await delay(10_000); return HttpResponse.json(OPEN); }),
      http.post("/api/project/demo", () => { opens += 1; return HttpResponse.json({ ...OPEN, demo: true }); }),
    );
    renderWithQuery(<App />);
    fireEvent.change(await screen.findByLabelText("Browse your files"), { target: { files: [new File(["x"], "server.ts")] } });
    fireEvent.click(await screen.findByRole("button", { name: "Test these tools →" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Try a demo" }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Try a demo" }));
    expect(opens).toBe(1);
  });

  it("sends the tests page home when no project is open", async () => {
    server.use(http.get("/api/project", () => HttpResponse.json(NONE)));
    render(<QueryClientProvider client={testQueryClient()}><MemoryRouter initialEntries={["/routing"]}><App /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("Scan your server's tools")).not.toBeNull();
  });

  it("reaches the tests by no tab, and leads back to the scan", async () => {
    server.use(
      http.get("/api/project", () => HttpResponse.json(OPEN)),
      http.get("/api/routing/catalog", () => HttpResponse.json({ revision: "r", cases: [], tools: [] })),
    );
    render(<QueryClientProvider client={testQueryClient()}><MemoryRouter initialEntries={["/routing"]}><App /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(document.querySelector(".sec-routing")).not.toBeNull());
    expect([...document.querySelectorAll("nav[aria-label=pages] a")].map((a) => a.textContent)).toEqual(["Scan", "Docs"]);
    fireEvent.click(screen.getByRole("link", { name: "Scan" }));
    expect(await screen.findByText("Scan your server's tools")).not.toBeNull();
  });

  it("says what the scan could not find", async () => {
    server.use(
      http.get("/api/project", () => HttpResponse.json(NONE)),
      http.post("/api/project/upload", () => HttpResponse.json({ detail: "No Python, TypeScript or JavaScript in what you dropped" }, { status: 422 })),
    );
    renderWithQuery(<App />);
    fireEvent.change(await screen.findByLabelText("Browse your files"), { target: { files: [new File(["x"], "notes.zip")] } });
    expect((await screen.findByText("No Python, TypeScript or JavaScript in what you dropped")).closest("#setup-error")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Test these tools →" })).toBeNull();
  });
});
