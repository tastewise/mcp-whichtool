import { useQuery } from "@tanstack/react-query";
import { keys } from "../keys";
import { getRoutingState, getRun } from "../endpoints/routing";

// routing-page.js refreshRouting, every 4 s and on each filter or model change.
export function useRoutingState(filter: string, model: string, enabled = true) {
  return useQuery({ queryKey: keys.routing(filter, model), queryFn: () => getRoutingState(filter, model), enabled, refetchInterval: enabled ? 4000 : false, refetchIntervalInBackground: true, placeholderData: (previous) => previous });
}
// The models the project names, once per page: a model outside the page's list is still a model to run.
export function useProjectModels() {
  const query = useQuery({ queryKey: keys.routing("", "models"), queryFn: () => getRoutingState("", ""), staleTime: Infinity });
  return query.data?.models ?? [];
}
export function useRun(id: string | null) {
  return useQuery({ queryKey: keys.run(id ?? ""), queryFn: () => getRun(id!), enabled: Boolean(id) });
}
