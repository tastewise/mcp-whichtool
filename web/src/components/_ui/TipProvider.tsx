import { createContext, memo, useContext, type ReactNode } from "react";
import { Tooltip } from "radix-ui";

// Fast to show; once one is open, the next control's tip shows at once.
export const TIP_DELAY = 150;
export const TIP_SKIP = 300;

const Scoped = createContext(false);
export const useTipScope = () => useContext(Scoped);

// One provider at the root, so every tip shares the delays and the skip window.
function TipProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={TIP_DELAY} skipDelayDuration={TIP_SKIP}>
      <Scoped.Provider value={true}>{children}</Scoped.Provider>
    </Tooltip.Provider>
  );
}

export default memo(TipProvider);
