import { memo, type ComponentProps } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Icon from "./Icon";
import Tip from "./Tip";

export const iconButtonVariants = cva("iconbutton", {
  variants: { copied: { true: "copied", false: "" } },
  defaultVariants: { copied: false },
});

export type IconButtonProps = ComponentProps<"button"> & VariantProps<typeof iconButtonVariants> & {
  icon?: string;
  join?: boolean;
  asChild?: boolean;
};

// Icon-only: keep an aria-label; `title` adds the tooltip, it does not name the button.
function IconButton({ copied, icon, join, asChild, className, title, children, ...rest }: IconButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Tip content={title}><Comp className={cn(iconButtonVariants({ copied }), className)} {...rest}>
      {icon ? <Icon html={icon} join={join} /> : null}
      {children}
    </Comp></Tip>
  );
}

export default memo(IconButton);
