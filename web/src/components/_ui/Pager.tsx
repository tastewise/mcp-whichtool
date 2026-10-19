import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const pagerVariants = cva("", {
  variants: { kind: { cases: "pager" } },
  defaultVariants: { kind: "cases" },
});

export type PagerProps = ComponentProps<"div"> & VariantProps<typeof pagerVariants>;

function Pager({ kind, className, ...rest }: PagerProps) {
  return <div className={cn(pagerVariants({ kind }), className)} {...rest} />;
}

export default memo(Pager);
