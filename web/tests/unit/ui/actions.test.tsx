import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, ICON, IconButton } from "@/components/_ui";

describe("_ui actions", () => {
  it("Button composes the old classes; a plain one has no class attribute", () => {
    render(<Button variant="small" tone="primary" action="start" glyph="plug">Add</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toBe("small primary");
    expect(button.dataset.action).toBe("start");
    expect(button.firstElementChild!.className).toBe("ico");
    expect(button.textContent).toBe("Add");
    expect(render(<Button>x</Button>).container.innerHTML).toBe("<button>x</button>");
    expect(render(<Button variant="step" aria-label="Next page" glyph="next" />).container.innerHTML).toContain('class="small step"');
  });
  it("IconButton renders the 16 px icon, copied when asked", () => {
    const { container, rerender } = render(<IconButton icon={ICON.copy} aria-label="Copy the URL" title="Copy" />);
    expect(container.firstElementChild!.className).toBe("iconbutton");
    expect(container.querySelector("svg")!.getAttribute("stroke-linejoin")).toBe("round");
    rerender(<IconButton icon={ICON.close} join={false} copied aria-label="Close" />);
    expect(container.firstElementChild!.className).toBe("iconbutton copied");
    expect(container.querySelector("svg")!.hasAttribute("stroke-linejoin")).toBe(false);
  });
});
