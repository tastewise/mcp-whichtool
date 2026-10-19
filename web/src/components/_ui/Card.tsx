import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const cardVariants = cva("card", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type CardProps = ComponentProps<"div"> & VariantProps<typeof cardVariants> & { as?: "div" | "section" };

function Card({ kind, as = "div", className, ...rest }: CardProps) {
  const Tag = as as "div";
  return <Tag className={cn(cardVariants({ kind }), className)} {...rest} />;
}

export default memo(Card);
