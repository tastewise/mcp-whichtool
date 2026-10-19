import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Button, IconButton, ICON, Input, SegOpt, Segmented, Tip, TipProvider } from "@/components/_ui";
import { tipOf } from "../support/tip";

const gone = () => waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());

describe("Tip", () => {
  it("shows on hover, through a Button's title, and no native title is left", async () => {
    render(<TipProvider><Button variant="small" title="Builds the zip">Download</Button></TipProvider>);
    const button = screen.getByRole("button", { name: "Download" });
    expect(button.hasAttribute("title")).toBe(false);
    expect(await tipOf(button)).toBe("Builds the zip");
  });
  it("shows on keyboard focus and closes on Escape", async () => {
    render(<IconButton icon={ICON.copy} aria-label="Copy the URL" title="Copy" />);
    const button = screen.getByRole("button", { name: "Copy the URL" });
    await userEvent.setup().tab();
    expect(button).toHaveFocus();
    expect((await screen.findByRole("tooltip")).textContent).toBe("Copy");
    // The tip describes the button; it does not rename it.
    expect(button).toHaveAccessibleName("Copy the URL");
    expect(button).toHaveAccessibleDescription("Copy");
    fireEvent.keyDown(document, { key: "Escape" });
    await gone();
  });
  it("closes when the pointer leaves or presses", async () => {
    render(<Button title="Sign in first">Sign in</Button>);
    const button = screen.getByRole("button");
    fireEvent.pointerMove(button);
    await screen.findByRole("tooltip");
    fireEvent.pointerLeave(button);
    fireEvent.pointerMove(document.body, { clientX: 400, clientY: 400 });
    await gone();
    fireEvent.pointerMove(button);
    await screen.findByRole("tooltip");
    fireEvent.pointerDown(button);
    await gone();
  });
  it("a disabled button still shows what would enable it, on hover and on focus", async () => {
    render(<Button disabled title="Pick a Target to test it">Test</Button>);
    const button = screen.getByRole("button", { name: "Test" });
    expect(button).toBeDisabled();
    expect(await tipOf(button)).toBe("Pick a Target to test it");
    const anchor = button.closest<HTMLElement>(".tip-anchor")!;
    expect(anchor.tabIndex).toBe(0);
    await userEvent.setup().tab();
    expect(anchor).toHaveFocus();
    expect((await screen.findByRole("tooltip")).textContent).toBe("Pick a Target to test it");
  });
  it("once its hint has shown, a button toggling disabled stays the same element", async () => {
    const { rerender } = render(<Button title="Type a value first" disabled>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(await tipOf(button)).toBe("Type a value first");
    rerender(<Button title={undefined} disabled={false}>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBe(button);
    // Enabled, the span is no tab stop of its own: the button is.
    expect(button.closest(".tip-anchor")!.hasAttribute("tabindex")).toBe(false);
    rerender(<Button title="Type a value first" disabled>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBe(button);
  });
  it("a field keeps its focus when its tip first appears", () => {
    const { rerender } = render(<Input aria-label="url" />);
    const field = screen.getByRole("textbox", { name: "url" });
    field.focus();
    rerender(<Input aria-label="url" title="Use one of: MCP dev" />);
    expect(screen.getByRole("textbox", { name: "url" })).toBe(field);
    expect(field).toHaveFocus();
  });
  it("an autofocus that no key made opens no tip", async () => {
    fireEvent.pointerDown(document.body);
    render(<IconButton icon={ICON.close} aria-label="Close" title="Close" autoFocus />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("keeps the lines of a long text", async () => {
    render(<Tip content={"first line\nsecond line"}><span>x</span></Tip>);
    expect(await tipOf(screen.getByText("x"))).toBe("first line\nsecond line");
  });
  it("no content, no tip: the child renders as it is", () => {
    const { container } = render(<Tip content=""><span className="x">x</span></Tip>);
    expect(container.innerHTML).toBe('<span class="x">x</span>');
  });
  it("on a tab, the tab keeps its own state", async () => {
    render(<Segmented ariaLabel="Way" value="a" onValueChange={() => {}}><SegOpt value="a" title="the first">A</SegOpt><SegOpt value="b">B</SegOpt></Segmented>);
    const a = screen.getByRole("tab", { name: "A" });
    expect(a.getAttribute("data-state")).toBe("active");
    expect(await tipOf(a)).toBe("the first");
  });
});
