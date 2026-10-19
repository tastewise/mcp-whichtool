import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { openDemo, openProject } from "@/api/endpoints/project";
import { keys } from "@/api/keys";
import { registerToolTitles } from "@/lib/tool-label";
import { useRoutingStore } from "@/stores/routing.store";
import { initialLive } from "@/stores/routing-live";

const OPENING = ["project", "open"];

// Whether a project is being opened, from any button: one open at a time, or two could cross.
export const useOpening = () => useIsMutating({ mutationKey: OPENING }) > 0;

// Opens a project, a folder scanned or the demo, then its tests.
export function useOpenProject() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationKey: OPENING,
    mutationFn: (ask: { folder: string; server: string } | "demo") => ask === "demo" ? openDemo() : openProject(ask),
    onSuccess: async ({ catalog, ...opened }) => {
      // Everything the page read so far was read for another project, or none: dropped, not waited on.
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== "project" });
      client.setQueryData(keys.project, opened);
      // Ticks, filters, the writer model and the view belonged to the project before: none of them carry over.
      useRoutingStore.setState({ ticked: new Set(), filter: "", caseSearch: "", caseTool: "", casePage: 1, caseStatus: null, writer: "", proposals: null, adding: false, live: initialLive() });
      // The tests came back with the project: the page opens on them at once, with no second trip.
      if (catalog) {
        registerToolTitles(catalog.tools);
        client.setQueryData(keys.catalog, catalog);
      }
      await navigate("/routing");
    },
  });
}
