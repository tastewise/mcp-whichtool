import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorText } from "@/api/client";
import { startRoutingRun, stopRoutingRun } from "@/api/endpoints/routing";
import { useProjectModels, useRoutingState } from "@/api/queries/routing";
import { taskKey } from "@/features/activity/useTaskOutput";
import { notify } from "@/lib/notify";
import { useLogsStore } from "@/stores/logs.store";
import { useRoutingStore } from "@/stores/routing.store";
import { ROUTING_TASK } from "./models";
import { pickModel } from "./run.model";

export function useRoutingRun() {
  const client = useQueryClient();
  const filter = useRoutingStore((s) => s.filter);
  const model = useRoutingStore((s) => s.model);
  const draws = useRoutingStore((s) => s.draws);
  const resetLive = useRoutingStore((s) => s.resetLive);
  const query = useRoutingState(filter.trim(), model.trim());
  const state = query.data;
  const [busy, setBusy] = useState(false);

  // The picker shows the configured model until one is chosen; the reducer decides whether the live block changed.
  const projectModels = useProjectModels();
  const effectiveModel = pickModel(model, projectModels);
  useEffect(() => {
    if (!state || !state.available) return;
    useRoutingStore.getState().updateLive(Boolean(state.running), state.exit_code, state.started_at ?? 0);
  }, [state]);

  // `wanted` is for a caller that has just computed a selection: the store's filter has
  // not reached this closure yet, and the run must take the selection, not the last one.
  const run = async (wanted?: string) => {
    if (busy || !state) return;
    setBusy(true);
    try {
      if (state.running) { await stopRoutingRun(); notify("stopped"); }
      else {
        resetLive();
        await startRoutingRun({ draws, filter: (wanted ?? filter).trim(), model: effectiveModel.trim() });
        useLogsStore.getState().clear(taskKey(ROUTING_TASK));
        notify("running — the output streams below");
      }
    } catch (error) {
      notify.error("could not run: " + errorText(error));
    } finally { setBusy(false); }
    await client.invalidateQueries({ queryKey: ["routing"] });
  };

  return { state, failed: query.isError, run, busy, effectiveModel };
}
