import { memo, type ComponentProps, type ReactNode } from "react";
import { Label } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const fieldVariants = cva("editor-field", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type FieldProps = ComponentProps<"label"> & VariantProps<typeof fieldVariants> & { label: ReactNode };

// routing.html label.editor-field: the caption, then the control, in one label (Radix Label).
function Field({ kind, label, className, children, ...rest }: FieldProps) {
  return <Label.Root className={cn(fieldVariants({ kind }), className)} {...rest}>{label}{children}</Label.Root>;
}

export default memo(Field);
