import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const logBarVariants = cva("logbar", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type LogBarProps = ComponentProps<"div"> & VariantProps<typeof logBarVariants>;

function LogBar({ kind, className, ...rest }: LogBarProps) {
  return <div className={cn(logBarVariants({ kind }), className)} {...rest} />;
}

export default memo(LogBar);
