import { createContext, memo, useContext, type ReactNode } from "react";
import { Tabs as RadixTabs, ToggleGroup } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const segmentedVariants = cva("seg", {
  variants: { busy: { true: "busy", false: "" } },
  defaultVariants: { busy: false },
});

export type SegMode = "tabs" | "group";
const SegModeContext = createContext<SegMode>("tabs");
export const useSegMode = () => useContext(SegModeContext);

export type SegmentedProps = VariantProps<typeof segmentedVariants> & {
  mode?: SegMode;
  as?: "span" | "div";
  id?: string;
  ariaLabel: string;
  value: string | null;
  onValueChange: (value: string) => void;
  className?: string;
  children: ReactNode;
};

// entry/upstream/remote bars are role=tablist (Radix Tabs); the traffic filters are role=group (Radix ToggleGroup).
function Segmented({ busy, mode = "tabs", as = "span", id, ariaLabel, value, onValueChange, className, children }: SegmentedProps) {
  const Tag = as as "span";
  const cls = cn(segmentedVariants({ busy }), className);
  // routing.html gives the traffic filters role=group; Radix would say radiogroup.
  const own = mode === "group" ? { role: "group" } : {};
  const inner = <Tag className={cls} id={id} aria-label={ariaLabel} {...own}>{children}</Tag>;
  return (
    <SegModeContext.Provider value={mode}>
      {mode === "tabs" ? (
        <RadixTabs.Root asChild value={value ?? ""} onValueChange={onValueChange} activationMode="manual">
          <RadixTabs.List asChild>{inner}</RadixTabs.List>
        </RadixTabs.Root>
      ) : (
        <ToggleGroup.Root asChild type="single" value={value ?? ""} onValueChange={(next) => next && onValueChange(next)}>
          {inner}
        </ToggleGroup.Root>
      )}
    </SegModeContext.Provider>
  );
}

export default memo(Segmented);
