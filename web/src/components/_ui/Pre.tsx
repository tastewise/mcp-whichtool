import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const preVariants = cva("", {
  variants: { kind: { plain: "", before: "ai-before", prompt: "promptbody" } },
  defaultVariants: { kind: "plain" },
});

export type PreProps = ComponentProps<"pre"> & VariantProps<typeof preVariants>;

function Pre({ kind, className, ...rest }: PreProps) {
  return <pre className={cn(preVariants({ kind }), className) || undefined} {...rest} />;
}

export default memo(Pre);
