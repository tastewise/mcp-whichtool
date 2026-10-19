import { memo, type ReactNode } from "react";
import Tip from "./Tip";

// A "?" beside a label: what the setting means, on hover or focus, without a line of text under it.
function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  return <Tip content={children}><button type="button" className="helptip" aria-label={label}>?</button></Tip>;
}

export default memo(HelpTip);
