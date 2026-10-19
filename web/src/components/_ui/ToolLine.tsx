import { Fragment, memo } from "react";
import { toolTitle } from "@/lib/tool-label";

export type ToolLineProps = { label: string; names: (string | null | undefined)[] };

// tool-label.js toolLine(): "Label: Title code · Title code".
function ToolLine({ label, names }: ToolLineProps) {
  return (
    <p className="tool-reference">
      {label + ": "}
      {names.map((name, index) => (
        <Fragment key={index}>
          {index ? " · " : null}
          {!name ? "No tool selected" : <><strong>{toolTitle(name)}</strong>{" "}<code>{name}</code></>}
        </Fragment>
      ))}
    </p>
  );
}

export default memo(ToolLine);
