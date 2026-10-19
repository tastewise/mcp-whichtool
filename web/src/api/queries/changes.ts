import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { keys } from "../keys";
import { getDescriptions } from "../endpoints/changes";
import type { SourceDescription, Sources } from "../types/changes";
// One tool's source description; `null` when the console cannot locate it.
export function useSourceDescription(name: string, enabled: boolean) {
  const select = useCallback((data: Sources): SourceDescription | null => data.tools.find((tool) => tool.name === name) ?? null, [name]);
  return useQuery({ queryKey: keys.descriptions, queryFn: getDescriptions, enabled, select });
}
