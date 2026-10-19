import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Tip from "./Tip";

export const monoVariants = cva("", {
  variants: { kind: { mono: "mono", entryurl: "mono entryurl", code: "", cid: "cid" } },
  defaultVariants: { kind: "mono" },
});

export type MonoProps = ComponentProps<"span"> & VariantProps<typeof monoVariants> & { "data-url"?: string };

function Mono({ kind, className, title, ...rest }: MonoProps) {
  const Tag = (kind === "code" ? "code" : "span") as "span";
  return <Tip content={title}><Tag className={cn(monoVariants({ kind }), className) || undefined} {...rest} /></Tip>;
}

export default memo(Mono);
