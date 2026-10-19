import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Drawer, Select, type SelectOption } from "@/components/_ui";
import { toolOptions } from "@/lib/tool-label";
import { openSelect } from "../support/select";

const TOOLS = ["find_stores", "track_order", "search_books", "get_book", "check_stock"];

function Harness({ options, onChange }: { options: SelectOption[]; onChange?: (value: string) => void }) {
  const [value, setValue] = useState("");
  return <Select id="pick" aria-label="Tool" value={value} options={options} onValueChange={(next) => { setValue(next); onChange?.(next); }} />;
}

const groups = (list: HTMLElement) => [...list.querySelectorAll(".select-group")].map((g) => g.textContent);
const labels = (list: HTMLElement) => [...list.querySelectorAll(".select-option-label")].map((o) => o.textContent);

describe("Select", () => {
  it("lists tools in the order the server gives them, with no groups", async () => {
    render(<Harness options={[{ value: "", label: "All tools" }, ...toolOptions(TOOLS, (t) => t, (t) => t)]} />);
    expect(document.getElementById("pick")!.textContent).toBe("All tools");
    const list = await openSelect("pick");
    expect(groups(list)).toEqual([]);
    expect(labels(list)).toEqual(["All tools", ...TOOLS]);
  });

  it("filters on the search box, and says when nothing matches", async () => {
    render(<Harness options={toolOptions(TOOLS, (t) => t, (t) => t)} />);
    const list = await openSelect("pick");
    const search = screen.getByRole("searchbox");
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "book" } });
    expect(labels(list)).toEqual(["search_books", "get_book"]);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(list.textContent).toBe("No match");
  });

  it("walks the options with the arrows, skips disabled ones, and picks with Enter", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} options={[{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }, { value: "c", label: "C", hint: "3" }]} />);
    await openSelect("pick");
    const search = screen.getByRole("searchbox");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("c");
    await waitFor(() => expect(document.getElementById("pick-list")).toBeNull());
    expect(document.getElementById("pick")!.getAttribute("data-value")).toBe("c");
    expect(document.getElementById("pick")!.textContent).toBe("C3");
  });

  it("opens inside a modal <dialog>, whose top layer would hide a menu portalled to the body", async () => {
    render(<Drawer id="d" labelledBy="t" open onClose={() => {}}><Harness options={[{ value: "a", label: "A" }]} /></Drawer>);
    const list = await openSelect("pick");
    expect(list.closest("dialog")!.id).toBe("d");
  });
});
