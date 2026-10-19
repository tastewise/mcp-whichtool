import { memo, useState } from "react";
import type { CatalogTool } from "@/api/types/routing";
import { Button, Mono, Muted } from "@/components/_ui";
import { useRoutingStore } from "@/stores/routing.store";
import { draftCase } from "./useCatalog";
import WriteTests from "./WriteTests";

// The page that adds tests: what a test is, then the two ways to get some. `first`: the library is empty.
function GetStarted({ tools, first = true }: { tools: CatalogTool[]; first?: boolean }) {
  const openCase = useRoutingStore((s) => s.openCase);
  // While AI writes or its tests are reviewed, that is the whole page: the introduction steps aside.
  const [active, setActive] = useState(false);
  // While AI writes, the welcome stays and its progress shows below it.
  const [below, setBelow] = useState<HTMLDivElement | null>(null);
  const count = `${tools.length} tool${tools.length > 1 ? "s" : ""}`;
  return (
    <div id="get-started" data-active={active ? "yes" : undefined}>
      <div className="get-started-intro">
        <h3>{first ? "Add your first tests" : "Add tests"}</h3>
        <p className="get-started-lead">
          A test is a request a user could type, and the tool that should handle it. Running it shows whether the model picks that tool.
        </p>
        <p className="get-started-example">
          <Muted kind="dim">For example</Muted>
          <span>“What's the weather in Lyon tomorrow?”</span>
          <span aria-hidden="true">→</span>
          <Mono>get_weather</Mono>
        </p>
      </div>
      <div className="get-started-ways">
        <section className="get-started-way" id="get-started-ai">
          <div className="get-started-intro">
            <h4>Let AI write them</h4>
            <p>{`It writes requests for each of your ${count}, worded the way users would. You check them before they're added.`}</p>
          </div>
          <WriteTests tools={tools} label={`Write tests for ${count}`} onActive={setActive} progressIn={below} />
        </section>
        <section className="get-started-way" id="get-started-hand">
          <h4>Write your own</h4>
          <p>Type a request, choose the tool it should reach, and try it right away.</p>
          <Button tone="primary" id="get-started-add" onClick={() => openCase({ ...draftCase(), expect: tools[0]?.name ?? "" }, null)}>Add a test</Button>
        </section>
      </div>
      <div ref={setBelow} id="get-started-progress" />
    </div>
  );
}

export default memo(GetStarted);
