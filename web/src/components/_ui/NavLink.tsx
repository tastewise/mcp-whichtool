import { memo, type ReactNode } from "react";
import { Link } from "react-router";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Icon from "./Icon";

export const navLinkVariants = cva("navlink", { variants: { current: { true: "current", false: "" } }, defaultVariants: { current: false } });

export type NavLinkProps = VariantProps<typeof navLinkVariants> & { to: string; icon: string; className?: string; children: ReactNode };

// tw-header.js navlink: the icon, then the label, aria-current on the page you are on.
function NavLink({ current, to, icon, className, children }: NavLinkProps) {
  return <Link className={cn(navLinkVariants({ current }), className)} to={to} aria-current={current ? "page" : undefined}><Icon html={icon} />{children}</Link>;
}

export default memo(NavLink);
