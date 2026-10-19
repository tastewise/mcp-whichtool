import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Tip from "./Tip";

export const textareaVariants = cva("", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type TextareaProps = ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>;

function Textarea({ kind, className, title, ...rest }: TextareaProps) {
  return <Tip content={title} steady><textarea className={cn(textareaVariants({ kind }), className) || undefined} {...rest} /></Tip>;
}

export default memo(Textarea);
