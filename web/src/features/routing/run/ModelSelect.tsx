import { memo, useMemo } from "react";
import { useProjectModels } from "@/api/queries/routing";
import { Select } from "@/components/_ui";
import { useRoutingStore } from "@/stores/routing.store";
import { MODEL_GROUPS, MODEL_IDS } from "./models";

const OPTIONS = MODEL_GROUPS.flatMap((group) => group.options.map(([id, label]) => ({ value: id, label, group: group.label })));

// The run bar's model by default; a caller with its own choice passes onChange. The project's own models
// (its configured one, and every priced one) come first when the page's list does not know them.
function ModelSelect({ value, id = "routing-model", onChange }: { value: string; id?: string; onChange?: (model: string) => void }) {
  const setStore = useRoutingStore((s) => s.setModel);
  const setModel = onChange ?? setStore;
  const project = useProjectModels();
  const options = useMemo(() => [
    ...project.filter((model) => !MODEL_IDS.includes(model)).map((model) => ({ value: model, label: model, group: "This project" })),
    ...OPTIONS,
  ], [project]);
  return (
    <Select id={id} aria-label="model" value={value} onValueChange={setModel} placeholder="Choose a model" searchPlaceholder="Search models" options={options} />
  );
}

export default memo(ModelSelect);
