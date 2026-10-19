import { memo } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// Every bar wears the console's own: the green sweep of the test runs, never the browser's default.
export const progressVariants = cva("progress", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type ProgressProps = VariantProps<typeof progressVariants> & { id?: string; max: number; value: number | null; ariaLabel?: string; className?: string };

// Native <progress>: a null value is the sweeping, indeterminate bar of routing-live.js.
function Progress({ kind, id, max, value, ariaLabel, className }: ProgressProps) {
  return <progress id={id} className={cn(progressVariants({ kind }), className) || undefined} max={max} value={value ?? undefined} aria-label={ariaLabel} />;
}

export default memo(Progress);
