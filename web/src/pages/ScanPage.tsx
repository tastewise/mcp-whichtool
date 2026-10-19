import { useProject } from "@/api/queries/project";
import { ErrLine, Waiting } from "@/components/_ui";
import AppHeader from "@/components/layout/AppHeader";
import PageShell from "@/components/layout/PageShell";
import ProjectSetup from "@/features/project/ProjectSetup";
import { useTitle } from "@/lib/use-title";

// The home page: find a server's tools, from its source or its URL, and test them.
export default function ScanPage() {
  useTitle("Scan — mcp-whichtool");
  const project = useProject();
  return (
    <PageShell>
      <AppHeader page="scan" />
      {project.data ? <ProjectSetup key={project.data.folder} project={project.data} />
        : project.isError ? <p><ErrLine>The console did not answer. Is `whichtool serve` still running?</ErrLine></p>
        : <Waiting label="Opening the project…" />}
    </PageShell>
  );
}
