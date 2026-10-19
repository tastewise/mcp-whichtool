import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Tip from "./Tip";

export const mutedVariants = cva("", {
  variants: {
    kind: {
      runDate: "run-date", dim: "dim", desc: "desc"
    }
  },
  defaultVariants: { kind: "runDate" },
});

export type MutedProps = ComponentProps<"span"> & VariantProps<typeof mutedVariants> & { as?: "span" | "p" | "div" };

function Muted({ kind, as = "span", className, title, ...rest }: MutedProps) {
  const Tag = as as "span";
  return <Tip content={title}><Tag className={cn(mutedVariants({ kind }), className)} {...rest} /></Tip>;
}

export default memo(Muted);
