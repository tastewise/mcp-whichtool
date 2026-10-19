import { memo, type ComponentProps, type CSSProperties } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const inlineVariants = cva("", {
  variants: {
    kind: {
      plain: "", l1: "l1", headerslot: "headerslot", pushed: "topgroup pushed",
      liveHeading: "live-heading",
      caseActions: "case-actions", head: ""
    }
  },
  defaultVariants: { kind: "plain" },
});

// tools.js builds the detail head with these three inline styles, not a class.
const HEAD_STYLE: CSSProperties = { display: "flex", alignItems: "center", gap: "12px" };

export type InlineProps = ComponentProps<"div"> & VariantProps<typeof inlineVariants> & { as?: "div" | "span" | "td" };

function Inline({ kind, as = "div", className, style, ...rest }: InlineProps) {
  const Tag = as as "div";
  return <Tag className={cn(inlineVariants({ kind }), className) || undefined} style={kind === "head" ? { ...HEAD_STYLE, ...style } : style} {...rest} />;
}

export default memo(Inline);
