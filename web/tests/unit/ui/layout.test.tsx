import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as ui from "@/components/_ui";
import { Brand, Footer, Inline, Mono, Muted, RepoLink } from "@/components/_ui";
import { REPO } from "@/components/_ui/RepoLink";

describe("_ui layouts and text", () => {
  it("every export is memoised", () => {
    for (const [name, component] of Object.entries(ui)) {
      if (typeof component === "object" && !("$$typeof" in component)) continue;
      expect((component as { $$typeof?: symbol }).$$typeof, name).toBe(Symbol.for("react.memo"));
    }
  });
  it("Inline composes the old classes and the tools.js head style", () => {
    expect(render(<Inline kind="pushed" />).container.innerHTML).toBe('<div class="topgroup pushed"></div>');
    expect(render(<Inline kind="l1" as="span" />).container.innerHTML).toBe('<span class="l1"></span>');
    expect(render(<Inline kind="head" />).container.innerHTML).toBe('<div style="display: flex; align-items: center; gap: 12px;"></div>');
    expect(render(<Inline />).container.innerHTML).toBe("<div></div>");
  });
  it("Mono, Muted, Footer, Brand", () => {
    expect(render(<Mono kind="entryurl" id="tunnel-value" data-url="https://x">x</Mono>).container.innerHTML)
      .toBe('<span class="mono entryurl" id="tunnel-value" data-url="https://x">x</span>');
    expect(render(<Mono kind="code">search_books</Mono>).container.innerHTML).toBe("<code>search_books</code>");
    expect(render(<Muted as="p">hint</Muted>).container.innerHTML).toBe('<p class="run-date">hint</p>');
    expect(render(<Muted kind="dim">since 2s ago</Muted>).container.innerHTML).toBe('<span class="dim">since 2s ago</span>');
    const footer = render(<Footer />).container.querySelector("footer")!;
    expect(footer.textContent).toBe("Apache-2.0 · Maintained by ");
    expect(footer.querySelector("img")!.getAttribute("alt")).toBe("Tastewise");
    expect([...footer.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["https://www.apache.org/licenses/LICENSE-2.0", "https://tastewise.io/"]);
    const brand = render(<Brand />).container.firstElementChild!;
    expect(brand.className).toBe("brand");
    const mark = brand.querySelector("img")!;
    expect([mark.className, mark.getAttribute("src"), mark.getAttribute("alt"), mark.getAttribute("width"), mark.getAttribute("height")])
      .toEqual(["mark", "/favicon.svg", "", "24", "28"]);
    expect(brand.querySelector("h1")!.textContent).toBe("mcp-whichtool");
  });
  it("RepoLink points at the repository and names the package's version", () => {
    const link = render(<RepoLink />).container.querySelector("a")!;
    expect([link.className, link.getAttribute("href"), link.getAttribute("target")]).toEqual(["repolink", REPO, "_blank"]);
    expect(REPO).toBe("https://github.com/tastewise/mcp-whichtool");
    expect(link.textContent).toBe(`v${__VERSION__}`);
    expect(__VERSION__).toMatch(/^\d+\.\d+\.\d+/);
    expect(link.getAttribute("aria-label")).toBe(`mcp-whichtool v${__VERSION__} on GitHub`);
  });
});
