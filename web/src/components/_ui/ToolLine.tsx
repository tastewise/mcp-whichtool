import { Fragment, memo } from "react";
import { toolTitle } from "@/lib/tool-label";

// `neighbours`: tools from another server's set, by that set: a pick of one never reached this server.
export type ToolLineProps = { label: string; names: (string | null | undefined)[]; neighbours?: Record<string, string> };

// tool-label.js toolLine(): "Label: Title code · Title code".
function ToolLine({ label, names, neighbours }: ToolLineProps) {
  return (
    <p className="tool-reference">
      {label + ": "}
      {names.map((name, index) => (
        <Fragment key={index}>
          {index ? " · " : null}
          {!name ? "No tool selected" : <><strong>{toolTitle(name)}</strong>{" "}<code>{name}</code>
            {neighbours?.[name] ? <span className="tool-neighbour">{` (neighbour: ${neighbours[name]})`}</span> : null}</>}
        </Fragment>
      ))}
    </p>
  );
}

export default memo(ToolLine);
