import { memo, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const footerVariants = cva("", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type FooterProps = ComponentProps<"footer"> & VariantProps<typeof footerVariants>;

// Who publishes it, as NOTICE says: credited here, never part of how the console works.
const MAINTAINER = { name: "Tastewise", url: "https://tastewise.io/" };
const LICENSE = "https://www.apache.org/licenses/LICENSE-2.0";

function Footer({ kind, className, children, ...rest }: FooterProps) {
  return (
    <footer className={cn(footerVariants({ kind }), className) || undefined} {...rest}>
      {children ?? <>
        <span className="footer-credit">
          <a href={LICENSE} target="_blank" rel="noreferrer">Apache-2.0</a>
          {" · Maintained by "}
          <a href={MAINTAINER.url} target="_blank" rel="noreferrer" className="footer-logo">
            <img src={`${import.meta.env.BASE_URL}tastewise-logo.svg`} alt={MAINTAINER.name} height={16} width={73} />
          </a>
        </span>
      </>}
    </footer>
  );
}

export default memo(Footer);
