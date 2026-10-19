import { memo, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const errLineVariants = cva("err", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type ErrLineProps = VariantProps<typeof errLineVariants> & { className?: string; children: ReactNode };

function ErrLine({ kind, className, children }: ErrLineProps) {
  return <span className={cn(errLineVariants({ kind }), className)}>{children}</span>;
}

export default memo(ErrLine);
