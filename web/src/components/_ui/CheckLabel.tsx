import { memo, type ReactNode } from "react";
import { Label } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const checkLabelVariants = cva("", {
  variants: { kind: { showhidden: "showhidden", runFilter: "run-filter", caseTick: "case-tick" } },
  defaultVariants: { kind: "showhidden" },
});

export type CheckLabelProps = VariantProps<typeof checkLabelVariants> & {
  id?: string;
  inputId?: string;
  hidden?: boolean;
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  children: ReactNode;
};

function CheckLabel({ kind, id, inputId, hidden, checked, indeterminate = false, onCheckedChange, className, children }: CheckLabelProps) {
  return (
    <Label.Root className={cn(checkLabelVariants({ kind }), className)} id={id} hidden={hidden}>
      <input type="checkbox" id={inputId} checked={checked} ref={(node) => { if (node) node.indeterminate = indeterminate; }} onChange={(event) => onCheckedChange(event.target.checked)} />
      {children}
    </Label.Root>
  );
}

export default memo(CheckLabel);
