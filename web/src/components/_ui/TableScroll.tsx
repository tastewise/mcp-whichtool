import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const tableScrollVariants = cva("table-scroll", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type TableScrollProps = ComponentProps<"div"> & VariantProps<typeof tableScrollVariants>;

function TableScroll({ kind, className, ...rest }: TableScrollProps) {
  return <div className={cn(tableScrollVariants({ kind }), className)} {...rest} />;
}

export default memo(TableScroll);
