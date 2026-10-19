import { memo, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const secHeadVariants = cva("sechead", { variants: { sub: { true: "sub", false: "" } }, defaultVariants: { sub: false } });

// after: beside the title, outside the heading, so the heading's name stays its text.
export type SecHeadProps = VariantProps<typeof secHeadVariants> & { id?: string; titleId?: string; right?: ReactNode; after?: ReactNode; className?: string; children: ReactNode };

function SecHead({ sub, id, titleId, right, after, className, children }: SecHeadProps) {
  const title = <h2 id={titleId}>{children}</h2>;
  return <div className={cn(secHeadVariants({ sub }), className)} id={id}>{after ? <span className="sechead-title">{title}{after}</span> : title}{right}</div>;
}

export default memo(SecHead);
