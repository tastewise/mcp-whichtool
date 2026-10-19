import { memo, type MouseEvent, type ReactNode } from "react";
import { Tabs as RadixTabs, ToggleGroup } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { useSegMode } from "./Segmented";
import Tip from "./Tip";

export const segOptVariants = cva("segopt", {
  // idle: the option in use is chosen but not running, or its deployed target does not answer.
  variants: { on: { true: "on", false: "" }, inuse: { true: "inuse", false: "" }, idle: { true: "idle", false: "" } },
  defaultVariants: { on: false, inuse: false, idle: false },
});

export type SegOptProps = VariantProps<typeof segOptVariants> & {
  value: string;
  title?: string;
  where?: string;
  className?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
};

function SegOpt({ on, inuse, idle, value, title, where, className, onClick, children }: SegOptProps) {
  const mode = useSegMode();
  const cls = cn(segOptVariants({ on, inuse, idle: Boolean(inuse && idle) }), className);
  if (mode === "group") {
    return <Tip content={title} composed><ToggleGroup.Item value={value} className={cls} data-where={where} onClick={onClick}>{children}</ToggleGroup.Item></Tip>;
  }
  return <Tip content={title} composed><RadixTabs.Trigger value={value} className={cls} data-where={where} onClick={onClick}>{children}</RadixTabs.Trigger></Tip>;
}

export default memo(SegOpt);
