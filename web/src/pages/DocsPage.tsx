import { useParams } from "react-router";
import { Empty } from "@/components/_ui";
import AppHeader from "@/components/layout/AppHeader";
import PageShell from "@/components/layout/PageShell";
import DocArticle from "@/features/docs/DocArticle";
import DocsNav from "@/features/docs/DocsNav";
import { DOCS } from "@/features/docs/docs.model";
import { useTitle } from "@/lib/use-title";

// docs/guides: how to name and describe tools so a model routes to them, and how to test it.
export default function DocsPage() {
  const { slug } = useParams();
  const doc = slug ? DOCS.find((d) => d.slug === slug) : DOCS[0];
  useTitle(`${doc?.title ?? "Docs"} — mcp-whichtool`);
  return (
    <PageShell>
      <AppHeader page="docs" />
      <div className="docs">
        <div className="docs-side">{doc ? <DocsNav docs={DOCS} current={doc} /> : null}</div>
        {doc ? <DocArticle doc={doc} /> : <Empty>{`No guide called "${slug}".`}</Empty>}
      </div>
    </PageShell>
  );
}
