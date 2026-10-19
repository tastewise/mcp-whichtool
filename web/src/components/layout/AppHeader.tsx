import { memo, type ReactNode } from "react";
import { Brand, ICON, Inline, NavLink } from "@/components/_ui";
import KeysPanel from "@/features/keys/KeysPanel";
import DemoButton from "@/features/project/DemoButton";

export type PageKey = "scan" | "routing" | "docs";

// The tests have no tab: the scan opens a project on them. The guides do: they are read from anywhere.
const PAGES: { key: PageKey; href: string; label: string; icon: string }[] = [
  { key: "scan", href: "/", label: "Scan", icon: ICON.scan },
  { key: "docs", href: "/docs", label: "Docs", icon: ICON.note },
];

// Rendered as the <tw-header> custom tag, so console.css finds it.
function AppHeader({ page, children }: { page: PageKey; children?: ReactNode }) {
  return (
    <tw-header page={page} data-built="1">
      <Brand />
      <nav className="nav" aria-label="pages">
        {PAGES.map((item) => <NavLink key={item.key} to={item.href} icon={item.icon} current={item.key === page}>
          {item.label}
        </NavLink>)}
      </nav>
      <Inline kind="headerslot">{children}<DemoButton /><KeysPanel /></Inline>
    </tw-header>
  );
}

export default memo(AppHeader);
