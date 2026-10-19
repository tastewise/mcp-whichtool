import { memo, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const tableVariants = cva("run-history", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type TableProps = VariantProps<typeof tableVariants> & { head: string[]; scoped?: boolean; bodyId?: string; className?: string; children: ReactNode };

function Table({ kind, head, scoped, bodyId, className, children }: TableProps) {
  return (
    <table className={cn(tableVariants({ kind }), className)}>
      <thead><tr>{head.map((label) => <th key={label} scope={scoped ? "col" : undefined}>{label}</th>)}</tr></thead>
      <tbody id={bodyId}>{children}</tbody>
    </table>
  );
}

export default memo(Table);
