import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveDescription } from "@/api/endpoints/changes";
import { keys } from "@/api/keys";

type Body = Parameters<typeof saveDescription>[0];

// Writes a tool description into the source, then refreshes whatever reads it.
export function useSaveDescription() {
  const client = useQueryClient();
  return useCallback(async (body: Body) => {
    const saved = await saveDescription(body);
    void client.invalidateQueries({ queryKey: keys.descriptions });
    void client.invalidateQueries({ queryKey: keys.catalog });
    return saved;
  }, [client]);
}
