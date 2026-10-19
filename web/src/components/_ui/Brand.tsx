import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const brandVariants = cva("brand", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type BrandProps = ComponentProps<"div"> & VariantProps<typeof brandVariants> & { title?: string; src?: string };

function Brand({ kind, className, title = "mcp-whichtool", src = `${import.meta.env.BASE_URL}favicon.svg`, ...rest }: BrandProps) {
  return (
    <div className={cn(brandVariants({ kind }), className)} {...rest}>
      <img className="mark" src={src} alt="" width={24} height={28} />
      <h1>{title}</h1>
    </div>
  );
}

export default memo(Brand);
