import { memo } from "react";
import { Link } from "react-router";
import { pathOf, type Doc } from "./docs.model";

// Every guide, and the sections of the one open.
function DocsNav({ docs, current }: { docs: Doc[]; current: Doc }) {
  return (
    <nav className="docs-nav" aria-label="Docs">
      <ul>
        {docs.map((doc) => {
          const open = doc.slug === current.slug;
          return (
            <li key={doc.slug}>
              <Link to={pathOf(doc)} aria-current={open ? "page" : undefined}>{doc.title}</Link>
              {open && doc.headings.length ? (
                <ul>{doc.headings.map((h) => <li key={h.id} data-level={h.level}><a href={`#${h.id}`}>{h.text}</a></li>)}</ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default memo(DocsNav);
