import { memo, useCallback, useState } from "react";
import { suggestForRun } from "@/api/endpoints/routing";
import { useRun } from "@/api/queries/routing";
import { CheckLabel, Drawer, Empty, ICON, IconButton, Muted, SecHead } from "@/components/_ui";
import { costLabel, dateLabel } from "@/lib/time";
import { useRoutingStore } from "@/stores/routing.store";
import AdvicePanel from "../advice/AdvicePanel";
import LiveCase from "./LiveCase";

// The #run-detail drawer: one run, each failed case with its analysis and its fix.
function RunDrawer() {
  const id = useRoutingStore((s) => s.runOpen);
  const setRunOpen = useRoutingStore((s) => s.setRunOpen);
  const close = useCallback(() => setRunOpen(null), [setRunOpen]);
  const { data: result, isError } = useRun(id);
  const [failedOnly, setFailedOnly] = useState(false);
  const usage = result?.usage || {};
  const rows = result ? result.cases.filter((row) => !failedOnly || !row.passed) : [];
  return (
    <Drawer id="run-detail" labelledBy="run-detail-title" open={Boolean(id)} onClose={close}>
      <SecHead titleId="run-detail-title" right={<IconButton id="run-detail-close" icon={ICON.close} join={false} aria-label="Close" title="Close" autoFocus onClick={close} />}>Run details</SecHead>
      <div id="run-detail-body">
        {isError ? <p>Could not load this run. Close and try again.</p> : !result ? <p>Loading…</p> : (
          <>
            <h3>{result.model}</h3>
            <Muted as="p">{dateLabel(result.result_mtime)}</Muted>
            <p>{`${result.passed} / ${result.total} passed · ${result.samples} draws · ${costLabel(result.cost)}`}</p>
            <Muted as="p">{`Tokens: input ${usage.input_tokens || 0} · output ${usage.output_tokens || 0} · cache write ${usage.cache_creation_input_tokens || 0} · cache read ${usage.cache_read_input_tokens || 0}`}</Muted>
            {result.drafts && Object.keys(result.drafts).length ? (
              <Muted as="p" className="run-drafts">{`Ran with a draft description for ${Object.keys(result.drafts).join(", ")}: the source was not changed.`}</Muted>
            ) : null}
            <CheckLabel kind="runFilter" checked={failedOnly} onCheckedChange={setFailedOnly}>{`Failed only (${result.cases.filter((row) => !row.passed).length})`}</CheckLabel>
            <div>
              {!rows.length ? <Empty as="p">No failed prompts in this run.</Empty> : rows.map((row) => (
                <LiveCase key={row.id} row={row} samples={result.samples} picksLabel="Draws" className="run-case live-case">
                  {!row.passed ? (
                    <AdvicePanel cacheKey={JSON.stringify([result.id, row.id])} request={() => suggestForRun(result.id, row.id)}
                      replay={{ caseId: row.id, model: result.model, tools: [row.expect, ...row.votes.map((vote) => vote.tool).filter((tool) => tool !== row.expect)],
                        passed: result.cases.filter((item) => item.passed).map((item) => item.id),
                        proposed: result.proposed ? result.cases.map(({ id, prompt, expect }) => ({ id, prompt, expect })) : undefined }} />
                  ) : null}
                </LiveCase>
              ))}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

export default memo(RunDrawer);
