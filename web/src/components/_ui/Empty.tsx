import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const emptyVariants = cva("empty", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type EmptyProps = ComponentProps<"div"> & VariantProps<typeof emptyVariants> & { as?: "div" | "p" };

function Empty({ kind, as = "div", className, ...rest }: EmptyProps) {
  const Tag = as as "div";
  return <Tag className={cn(emptyVariants({ kind }), className)} {...rest} />;
}

export default memo(Empty);
