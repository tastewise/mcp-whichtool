import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const logPaneVariants = cva("log", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type LogPaneProps = ComponentProps<"div"> & VariantProps<typeof logPaneVariants>;

function LogPane({ kind, className, ...rest }: LogPaneProps) {
  return <div className={cn(logPaneVariants({ kind }), className)} {...rest} />;
}

export default memo(LogPane);
