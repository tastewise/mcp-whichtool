import { useQuery } from "@tanstack/react-query";
import { keys } from "../keys";
import { getProject } from "../endpoints/project";

// Once per page: the project only changes when this page opens one.
export function useProject() {
  return useQuery({ queryKey: keys.project, queryFn: getProject, staleTime: Infinity });
}
