import { fireEvent, render,} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Drawer, LogRow, NavLink, Progress, TaskLogRow, ToolLine } from "@/components/_ui";


describe("_ui surfaces", () => {
  it("every Progress wears the console's bar, indeterminate or counted, never the browser's default", () => {
    // The class the stylesheet gives the green sweep: a bar shown anywhere, by anyone, gets it.
    expect(render(<Progress id="p" max={1} value={null} ariaLabel="Working" />).container.querySelector("progress")!.className).toBe("progress");
    expect(render(<Progress max={3} value={2} className="extra" />).container.querySelector("progress")!.className).toBe("progress extra");
  });
  it("Drawer opens with showModal and tells when it closes", () => {
    const onClose = vi.fn();
    const { container, rerender } = render(<Drawer id="settings" labelledBy="settings-title" open={false} onClose={onClose}>x</Drawer>);
    const dialog = container.firstElementChild as HTMLDialogElement;
    expect([dialog.className, dialog.getAttribute("aria-labelledby"), dialog.hasAttribute("open")]).toEqual(["run-drawer", "settings-title", false]);
    rerender(<Drawer id="settings" labelledBy="settings-title" open onClose={onClose}>x</Drawer>);
    expect(dialog.hasAttribute("open")).toBe(true);
    fireEvent(dialog, new Event("close"));
    expect(onClose).toHaveBeenCalled();
  });
  it("LogRow, TaskLogRow, ToolLine, NavLink", () => {
    expect(render(<LogRow entry={{ line: "[13:25:09.598] INFO: ready", ts: "13:25:09.598", level: "info", text: "ready", continuation: false }} />).container.innerHTML)
      .toBe('<div class="logrow info" title="[13:25:09.598] INFO: ready"><span class="lt">13:25:09.598</span><span class="lv">info</span><span class="lm">ready</span></div>');
    expect(render(<LogRow entry={{ line: "  at foo", ts: "", level: "", text: "at foo", continuation: true }} />).container.firstElementChild!.className).toBe("logrow cont");
    expect(render(<TaskLogRow entry={{ line: "Done." }} />).container.innerHTML).toBe('<div class="logrow plain"><span class="lm" style="grid-column: 1 / -1;">Done.</span></div>');
    expect(render(<ToolLine label="Draws" names={["search_books", null]} />).container.innerHTML)
      .toBe('<p class="tool-reference">Draws: <strong>Search books</strong> <code>search_books</code> · No tool selected</p>');
    expect(render(<MemoryRouter><NavLink to="/routing" icon="<circle/>" current>Routing eval</NavLink></MemoryRouter>).container.querySelector("a")!.outerHTML)
      .toContain('class="navlink current" aria-current="page" href="/routing"');
  });
});
