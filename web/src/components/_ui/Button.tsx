import { memo, type ComponentProps } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Glyph, { type GlyphKind } from "./Glyph";
import Mark, { type MarkName } from "./Mark";
import Tip from "./Tip";

export const buttonVariants = cva("", {
  variants: {
    variant: { plain: "", small: "small", step: "small step", link: "run-link", prompt: "small icon promptopen", download: "small download" },
    tone: { none: "", primary: "primary", danger: "danger" }
  },
  defaultVariants: { variant: "plain", tone: "none" },
});

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
  action?: string;
  glyph?: GlyphKind;
  // The mark names its own class: a button that wears one is styled as that vendor's.
  mark?: MarkName;
  asChild?: boolean;
};

// `title` shows as the platform's tooltip, not the browser's.
function Button({ variant, tone, action, glyph, mark, asChild, className, title, children, ...rest }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Tip content={title}><Comp className={cn(buttonVariants({ variant, tone }), mark, className) || undefined} data-action={action} {...rest}>
      {glyph ? <Glyph kind={glyph} /> : null}
      {mark ? <Mark name={mark} /> : null}
      {children}
    </Comp></Tip>
  );
}

export default memo(Button);
