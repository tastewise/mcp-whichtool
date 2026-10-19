import { memo, type ReactNode } from "react";
import Progress from "./Progress";

// The console's one way of saying "this is running and you cannot hurry it": the
// indeterminate bar the eval uses, the step in words, and whatever can be done about it.
function Waiting({ label, id, children }: { label: string; id?: string; children?: ReactNode }) {
  return (
    <div className="waiting" id={id} role="status">
      <Progress max={1} value={null} ariaLabel={label} />
      <p>{label}</p>
      {children}
    </div>
  );
}

export default memo(Waiting);
