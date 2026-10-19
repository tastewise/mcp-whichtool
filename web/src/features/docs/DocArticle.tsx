import { memo, useEffect, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import { Link, useLocation } from "react-router";
import remarkGfm from "remark-gfm";
import { anchorOf, routeOf, textOf, type Doc } from "./docs.model";

const Heading2 = ({ children }: { children?: ReactNode }) => <h2 id={anchorOf(textOf(children))}>{children}</h2>;
const Heading3 = ({ children }: { children?: ReactNode }) => <h3 id={anchorOf(textOf(children))}>{children}</h3>;

// Another guide stays in the page, a section is a jump, the web opens in a new tab.
function DocLink({ href = "", children }: { href?: string; children?: ReactNode }) {
  const route = routeOf(href);
  if (route) return <Link to={route}>{children}</Link>;
  if (href.startsWith("#")) return <a href={href}>{children}</a>;
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

// A figure from its source's site: loaded from there, lazily, without telling it where from.
const DocImage = ({ src = "", alt }: { src?: string; alt?: string }) => <img src={src} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" />;

// "#describing-a-tool" → its id; a hash that does not decode ("#%") names no section.
const sectionOf = (hash: string) => { try { return decodeURIComponent(hash.slice(1)); } catch { return ""; } };

const COMPONENTS: Components = {
  h2: Heading2, h3: Heading3, img: DocImage, a: ({ href, children }) => <DocLink href={href}>{children}</DocLink>,
};

// One guide, as its Markdown reads; the section in the URL is scrolled to once it is drawn.
function DocArticle({ doc }: { doc: Doc }) {
  const { hash } = useLocation();
  useEffect(() => {
    const section = hash ? sectionOf(hash) : "";
    if (section) document.getElementById(section)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [doc.slug, hash]);
  return (
    <article className="doc" id="doc">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>{doc.body}</Markdown>
    </article>
  );
}

export default memo(DocArticle);
