import { useEffect } from "react";
import { Navigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "@/api/keys";
import { useCatalog } from "@/api/queries/catalog";
import { useProject } from "@/api/queries/project";
import { ErrLine, Waiting } from "@/components/_ui";
import AppHeader from "@/components/layout/AppHeader";
import PageShell from "@/components/layout/PageShell";
import CaseDialog from "@/features/routing/cases/CaseDialog";
import RunDrawer from "@/features/routing/live/RunDrawer";
import RunView from "@/features/routing/run/RunView";
import { useRoutingRun } from "@/features/routing/run/useRoutingRun";
import { useTitle } from "@/lib/use-title";

// The tests of the project open; with none open yet, the home page finds one.
export default function RoutingPage() {
  useTitle("Routing eval — mcp-whichtool");
  const project = useProject();
  if (project.data?.configured) return <Routing />;
  if (project.data) return <Navigate to="/" replace />;
  return (
    <PageShell>
      <AppHeader page="routing" />
      {project.isError ? <p><ErrLine>The console did not answer. Is `whichtool serve` still running?</ErrLine></p>
        : <Waiting label="Opening the project…" />}
    </PageShell>
  );
}

// The project's tests: written and tried here, kept in the library, exported from it.
function Routing() {
  const client = useQueryClient();
  const running = Boolean(useRoutingRun().state?.running);
  const catalog = useCatalog(true);
  // Entering the page reads the tests again: they may have changed on disk.
  useEffect(() => { void client.invalidateQueries({ queryKey: keys.catalog }); }, [client]);
  return (
    <PageShell>
      <AppHeader page="routing" />
      {catalog.isPending ? <Waiting label="Loading the tests…" /> : <section className="sec-routing">
        <RunView hidden={false} running={running} />
      </section>}
      <CaseDialog />
      <RunDrawer />
    </PageShell>
  );
}
