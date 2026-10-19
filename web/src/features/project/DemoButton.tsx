import { memo } from "react";
import { errorText } from "@/api/client";
import { Button, ErrLine } from "@/components/_ui";
import { useOpenProject, useOpening } from "./use-open-project";

// The header's "Try a demo": a bookshop server, its tests ready to run.
function DemoButton() {
  const open = useOpenProject();
  const opening = useOpening();
  return (
    <>
      {open.isError ? <ErrLine className="demo-error">{errorText(open.error)}</ErrLine> : null}
      <Button variant="small" tone="primary" id="demo-open" disabled={opening} onClick={() => { if (!opening) open.mutate("demo"); }}
        title="A bookshop server: 7 tools, 12 tests ready to run">
        Try a demo
      </Button>
    </>
  );
}

export default memo(DemoButton);
