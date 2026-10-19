import { isValidElement, type ReactNode } from "react";

// One guide: its route, its title, the sections the side lists, and the page itself.
export interface Doc { slug: string; file: string; title: string; headings: { id: string; text: string; level: 2 | 3 }[]; body: string }

const DOCS_BASE = "/docs";

// As GitHub anchors a heading: "Measure, don't guess" → "measure-dont-guess", one hyphen per space.
export function anchorOf(text: string): string {
  return text.trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/ /g, "-");
}

// A heading's words, whatever markup it holds: `code`, a link, emphasis.
export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

// "01-naming-and-describing-tools.md" → "naming-and-describing-tools": the order is the file's, not the URL's.
const slugOf = (file: string) => file.replace(/^.*\//, "").replace(/\.md$/, "").replace(/^\d+-/, "");

export function parseDoc(file: string, body: string): Doc {
  const title = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? slugOf(file);
  // Headings outside fenced code only: a "# comment" in a shell block is not a section.
  const prose = body.replace(/```[\s\S]*?```/g, "");
  const headings = [...prose.matchAll(/^(#{2,3}) (.+)$/gm)].map((m) => {
    const text = m[2]!.replace(/`/g, "").trim();
    return { id: anchorOf(text), text, level: m[1]!.length as 2 | 3 };
  });
  return { slug: slugOf(file), file: file.replace(/^.*\//, ""), title, headings, body };
}

// docs/guides/*.md, bundled at build time: the page needs no server to read them.
const FILES = import.meta.glob("../../../../docs/guides/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const DOCS: Doc[] = Object.keys(FILES).sort().map((file) => parseDoc(file, FILES[file]!));

export const pathOf = (doc: Doc) => `${DOCS_BASE}/${doc.slug}`;

// A link between guides, written as on GitHub ("02-testing-routing.md#draws"), stays in the page.
export function routeOf(href: string): string | undefined {
  const [file, hash] = href.split("#");
  if (!file || /^[a-z]+:/i.test(file) || !file.endsWith(".md")) return undefined;
  const doc = DOCS.find((d) => d.file === file.replace(/^\.\//, ""));
  return doc ? pathOf(doc) + (hash ? `#${hash}` : "") : undefined;
}
