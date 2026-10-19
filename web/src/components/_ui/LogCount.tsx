import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const logCountVariants = cva("logcount", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type LogCountProps = ComponentProps<"span"> & VariantProps<typeof logCountVariants>;

function LogCount({ kind, className, ...rest }: LogCountProps) {
  return <span className={cn(logCountVariants({ kind }), className)} role="status" {...rest} />;
}

export default memo(LogCount);
