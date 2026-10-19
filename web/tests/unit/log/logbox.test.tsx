import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LogBox, { entryRows } from "@/components/log/LogBox";

const rows = [
  { line: "[13:25:09.598] INFO: Pro API is ready", ts: "13:25:09.598", level: "info", text: "Pro API is ready", continuation: false },
  { line: "  at foo", ts: "", level: "", text: "at foo", continuation: true },
  { line: "boom", level: "error", text: "boom" },
];

describe("LogBox", () => {
  it("wraps tabs, search and count in a logbar above the pane", () => {
    const { container } = render(<LogBox paneId="logpane" placeholder="Search the log" rows={entryRows(rows)} tabs={<div className="tabs" role="tablist" id="log-tabs" />} />);
    const bar = container.querySelector(".logbar")!;
    expect([...bar.children].map((c) => c.id)).toEqual(["log-tabs", "logpane-search", "logpane-count"]);
    // The pane sits in its wrapper, which the jump button floats over.
    expect(bar.nextElementSibling!.className).toBe("logwrap");
    expect(bar.nextElementSibling!.firstElementChild!.id).toBe("logpane");
    expect(container.querySelectorAll("#logpane .logrow")).toHaveLength(3);
  });
  it("filters rows with hidden and counts like logsearch.js", () => {
    render(<LogBox paneId="p" placeholder="Search" rows={entryRows(rows)} />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "ready" } });
    const items = document.querySelectorAll("#p .logrow");
    expect(items[0]!.hasAttribute("hidden")).toBe(false);
    expect(items[1]!.hasAttribute("hidden")).toBe(true);
    expect(document.getElementById("p-count")!.textContent).toBe("1 of 3");
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(document.getElementById("p-count")!.textContent).toBe("nothing matches in 3");
  });
  it("shows the empty text when there is nothing", () => {
    render(<LogBox paneId="p" placeholder="Search" rows={[]} empty="Nothing yet." />);
    expect(document.querySelector("#p .logempty")!.textContent).toBe("Nothing yet.");
  });
  it("offers a jump back only once scrolled up, counts the lines that came since, and goes back down", () => {
    const many = entryRows(Array.from({ length: 30 }, (_, i) => ({ line: `line ${i}`, level: "info", text: `line ${i}` })));
    const { rerender } = render(<LogBox paneId="j" placeholder="Search" rows={many} />);
    const pane = document.getElementById("j")!;
    // jsdom lays nothing out: the pane is 100px tall over 1000px of rows.
    Object.defineProperties(pane, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 100 } });
    const scrolled = vi.fn((options: ScrollToOptions) => { pane.scrollTop = options.top!; });
    pane.scrollTo = scrolled as unknown as typeof pane.scrollTo;
    const jump = () => document.getElementById("j-jump");

    pane.scrollTop = 900; fireEvent.scroll(pane);
    expect(jump()).toBeNull();
    pane.scrollTop = 300; fireEvent.scroll(pane);
    expect(jump()!.textContent).toBe("Latest");
    rerender(<LogBox paneId="j" placeholder="Search" rows={[...many, ...entryRows([{ line: "a", level: "info", text: "a" }, { line: "b", level: "info", text: "b" }])]} />);
    expect(jump()!.textContent).toBe("2 new");
    expect(pane.scrollTop).toBe(300);

    fireEvent.click(jump()!);
    expect(scrolled).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    expect(jump()).toBeNull();
  });
});
