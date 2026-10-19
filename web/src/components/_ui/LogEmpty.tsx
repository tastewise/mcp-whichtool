import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const logEmptyVariants = cva("logempty", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type LogEmptyProps = ComponentProps<"div"> & VariantProps<typeof logEmptyVariants>;

function LogEmpty({ kind, className, ...rest }: LogEmptyProps) {
  return <div className={cn(logEmptyVariants({ kind }), className)} {...rest} />;
}

export default memo(LogEmpty);
