import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Icon, { ICON } from "./Icon";

export const repoLinkVariants = cva("repolink", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type RepoLinkProps = ComponentProps<"a"> & VariantProps<typeof repoLinkVariants> & { version?: string };

// Where the code lives, and which release this page is: the corner every open-source tool keeps.
export const REPO = "https://github.com/tastewise/mcp-whichtool";

function RepoLink({ kind, className, version = __VERSION__, ...rest }: RepoLinkProps) {
  return (
    <a className={cn(repoLinkVariants({ kind }), className)} href={REPO} target="_blank" rel="noreferrer"
      aria-label={`mcp-whichtool v${version} on GitHub`} {...rest}>
      <Icon html={ICON.github} />
      <span className="mono">v{version}</span>
    </a>
  );
}

export default memo(RepoLink);
