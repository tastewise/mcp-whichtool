import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { fetchJson } from "@/api/client";
import KeysPanel from "@/features/keys/KeysPanel";
import { setApiKeys } from "@/lib/api-keys";
import { server } from "../support/msw";
import { renderWithQuery } from "../support/query";

describe("KeysPanel", () => {
  afterEach(() => setApiKeys({}));

  it("asks for a key when there is none, keeps it in this browser, and sends it with each request", async () => {
    const sent: (string | null)[] = [];
    server.use(
      http.get("/api/keys", () => HttpResponse.json({ anthropic: false, openai: false })),
      http.get("/api/echo", ({ request }) => { sent.push(request.headers.get("x-anthropic-key")); return HttpResponse.json({}); }),
    );
    renderWithQuery(<KeysPanel />);
    const button = await screen.findByRole("button", { name: "Add an API key" });
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText("Anthropic API key"), { target: { value: "  sk-ant-xxxxxxxxxxxxtail " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("button", { name: "API keys" });
    expect(JSON.parse(localStorage.getItem("whichtool.api-keys")!)).toEqual({ anthropic: "sk-ant-xxxxxxxxxxxxtail" });
    await fetchJson("GET", "/api/echo");
    expect(sent).toEqual(["sk-ant-xxxxxxxxxxxxtail"]);

    fireEvent.click(screen.getByRole("button", { name: "API keys" }));
    fireEvent.click(screen.getByRole("button", { name: "Forget the keys" }));
    await screen.findByRole("button", { name: "Add an API key" });
    expect(localStorage.getItem("whichtool.api-keys")).toBeNull();
    await fetchJson("GET", "/api/echo");
    expect(sent).toEqual(["sk-ant-xxxxxxxxxxxxtail", null]);
  });

  it("says the keys are never sent to us, and links to where they go", async () => {
    server.use(http.get("/api/keys", () => HttpResponse.json({ anthropic: false, openai: false })));
    renderWithQuery(<KeysPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Add an API key" }));
    expect(document.getElementById("keys-privacy")!.textContent).toContain("never sent to us");
    expect(screen.getByRole("link", { name: "How your keys and tools are handled" }).getAttribute("href")).toBe("/docs/your-keys-and-your-tools");
  });

  it("says a key on this machine is enough", async () => {
    server.use(http.get("/api/keys", () => HttpResponse.json({ anthropic: true, openai: false })));
    renderWithQuery(<KeysPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "API keys" }));
    await waitFor(() => expect(screen.getByText("This machine has one: leave empty to use it.")).not.toBeNull());
  });
});

describe("A key that is not one", () => {
  it("is refused in the panel, never kept nor sent", async () => {
    server.use(http.get("/api/keys", () => HttpResponse.json({ anthropic: false, openai: false })));
    renderWithQuery(<KeysPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Add an API key" }));
    const anthropic = screen.getByLabelText("Anthropic API key");
    fireEvent.change(anthropic, { target: { value: "sk-ant-pasted with a space" } });
    // Typing says nothing yet: the check is on Save.
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toBe("An Anthropic API key has only letters, digits, - and _: no spaces.");
    expect(anthropic.getAttribute("aria-invalid")).toBe("true");
    expect(localStorage.getItem("whichtool.api-keys")).toBeNull();
    // Typing in it again clears what was said.
    fireEvent.change(anthropic, { target: { value: "sk-ant-xxxxxxxxxxxxtail" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(anthropic.getAttribute("aria-invalid")).toBeNull();
  });

  it("is refused when it does not start as the provider's keys do, each under its own field", async () => {
    server.use(http.get("/api/keys", () => HttpResponse.json({ anthropic: false, openai: false })));
    renderWithQuery(<KeysPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Add an API key" }));
    fireEvent.change(screen.getByLabelText("Anthropic API key"), { target: { value: "sk-xxxxxxxxxxxxtail" } });
    fireEvent.change(screen.getByLabelText("OpenAI API key"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getAllByRole("alert").map((line) => line.textContent)).toEqual([
      "An Anthropic API key starts with sk-ant-.",
      "An OpenAI API key starts with sk-.",
    ]);
    expect(localStorage.getItem("whichtool.api-keys")).toBeNull();
  });

  it("follows a change made in another tab", async () => {
    server.use(http.get("/api/keys", () => HttpResponse.json({ anthropic: false, openai: false })));
    renderWithQuery(<KeysPanel />);
    await screen.findByRole("button", { name: "Add an API key" });
    localStorage.setItem("whichtool.api-keys", JSON.stringify({ openai: "sk-xxxxxxxxxxxxtail" }));
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "whichtool.api-keys" })); });
    expect(await screen.findByRole("button", { name: "API keys" })).not.toBeNull();
    localStorage.removeItem("whichtool.api-keys");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "whichtool.api-keys" })); });
  });
});
