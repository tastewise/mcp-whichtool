import { memo, type ComponentProps } from "react";
import { Toggle } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const toggleButtonVariants = cva("", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type ToggleButtonProps = ComponentProps<"button"> & VariantProps<typeof toggleButtonVariants> & {
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
};

// A button that says aria-pressed, on Radix Toggle: the view tabs and the release list.
function ToggleButton({ kind, pressed, onPressedChange, className, ...rest }: ToggleButtonProps) {
  return <Toggle.Root pressed={pressed} onPressedChange={onPressedChange} className={cn(toggleButtonVariants({ kind }), className) || undefined} {...rest} />;
}

export default memo(ToggleButton);
