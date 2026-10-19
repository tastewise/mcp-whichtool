import { memo, type ReactNode } from "react";
import { Footer } from "@/components/_ui";
import ToastHost from "./ToastHost";

// .wrap around the page, the loopback footer, then the toasts.
function PageShell({ footer = true, children }: { footer?: boolean; children: ReactNode }) {
  return (
    <>
      <div className="wrap">
        {children}
        {footer ? <Footer /> : null}
      </div>
      <ToastHost />
    </>
  );
}

export default memo(PageShell);
