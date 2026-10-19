import { memo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { writingPrompt } from "@/api/endpoints/catalog";
import type { CatalogTool } from "@/api/types/routing";
import { Drawer, ErrLine, ICON, IconButton, Muted, Pre, SecHead, Select, Waiting } from "@/components/_ui";
import { toolOptions } from "@/lib/tool-label";
import { errorMessage } from "./useCatalog";

// The prompt AI writes tests from, word for word: the instructions it always gets, then the request
// for one tool, which lists every tool of the server and asks for the count chosen.
function WritingPrompt({ tools, count, onClose }: { tools: CatalogTool[]; count: number; onClose: () => void }) {
  const [tool, setTool] = useState(tools[0]?.name ?? "");
  const shown = useQuery({ queryKey: ["writing-prompt", tool, count], queryFn: () => writingPrompt(tool, "", count), enabled: Boolean(tool) });
  return (
    <Drawer id="writing-prompt" labelledBy="writing-prompt-title" open onClose={onClose} closeOnOutside>
      <SecHead titleId="writing-prompt-title" right={<IconButton icon={ICON.close} join={false} aria-label="Close" title="Close" onClick={onClose} />}>The prompt that writes the tests</SecHead>
      <Muted as="p" kind="desc">{`Sent once per tool. Each asks for ${count} test${count > 1 ? "s" : ""}, and lists every tool so the model words requests that are this tool's and not a neighbour's.`}</Muted>
      {tools.length > 1 ? (
        <label className="writing-prompt-tool"><span>For</span>
          <Select id="writing-prompt-tool" aria-label="Tool" value={tool} onValueChange={setTool} searchPlaceholder="Search tools"
            options={toolOptions(tools, (t) => t.name, (t) => t.title)} />
        </label>
      ) : null}
      {shown.isPending ? <Waiting label="Reading the server's tools…" /> : null}
      {shown.isError ? <ErrLine>{errorMessage(shown.error)}</ErrLine> : null}
      {shown.data ? <>
        <h3 className="writing-prompt-part">Instructions</h3>
        <Pre className="writing-prompt-text" id="writing-prompt-system">{shown.data.system}</Pre>
        <h3 className="writing-prompt-part">Request</h3>
        <Pre className="writing-prompt-text" id="writing-prompt-request">{shown.data.prompt}</Pre>
      </> : null}
    </Drawer>
  );
}

export default memo(WritingPrompt);
