import { memo } from "react";
import { SegOpt, Segmented } from "@/components/_ui";
import ModelSelect from "@/features/routing/run/ModelSelect";

const DRAWS = [[1, "1 · first look"], [3, "3 · majority"]] as const;

interface Props { id: string; model: string; onModel: (model: string) => void; draws: 1 | 3; onDraws: (draws: 1 | 3) => void }

// One Try's model and draws: the hand-written test and the AI proposals each have their own.
function TryOptions({ id, model, onModel, draws, onDraws }: Props) {
  return (
    <div className="try-options">
      <span>Try with</span>
      <ModelSelect id={`${id}-model`} value={model} onChange={onModel} />
      <Segmented mode="group" id={`${id}-draws`} ariaLabel="Try draws" value={String(draws)} onValueChange={(v) => { if (v) onDraws(Number(v) as 1 | 3); }}>
        {DRAWS.map(([n, text]) => <SegOpt key={n} value={String(n)} on={draws === n} inuse={draws === n}>{text}</SegOpt>)}
      </Segmented>
    </div>
  );
}

export default memo(TryOptions);
