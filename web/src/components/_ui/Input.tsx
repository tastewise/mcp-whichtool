import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Tip from "./Tip";

export const inputVariants = cva("", {
  variants: {
    variant: {
      plain: "", connector: "connector",
      logsearch: "connector logsearch"
    }
  },
  defaultVariants: { variant: "connector" },
});

export type InputProps = ComponentProps<"input"> & VariantProps<typeof inputVariants>;

function Input({ variant, className, title, ...rest }: InputProps) {
  return <Tip content={title} steady><input className={cn(inputVariants({ variant }), className) || undefined} {...rest} /></Tip>;
}

export default memo(Input);
