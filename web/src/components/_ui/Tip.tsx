import { cloneElement, memo, useCallback, useState, type FocusEvent, type ReactElement, type ReactNode, type SyntheticEvent } from "react";
import { Tooltip } from "radix-ui";
import { TIP_DELAY, TIP_SKIP, useTipScope } from "./TipProvider";

export type TipProps = {
  content?: ReactNode;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  // The child is a Radix item (a tab, a toggle) with its own data-state: the tip goes inside it, not over it.
  composed?: boolean;
  // A field being typed in: the tooltip structure is there from the start, so a tip appearing never remounts it.
  steady?: boolean;
};

// Whether the last input was the keyboard: a focus it did not make (an autofocus, a click) opens no tip.
let keyboard = false;
if (typeof document !== "undefined") {
  document.addEventListener("keydown", () => { keyboard = true; }, true);
  document.addEventListener("pointerdown", () => { keyboard = false; }, true);
}
// A tip inside another (a "?" in a button) takes the event: the outer one does not open over it.
const claimed = new WeakSet<Event>();
const claim = (event: SyntheticEvent) => {
  if (claimed.has(event.nativeEvent)) event.preventDefault();
  else claimed.add(event.nativeEvent);
};
const onFocus = (event: FocusEvent<HTMLElement>) => { claim(event); if (!keyboard) event.preventDefault(); };

const isEmpty = (content: ReactNode) => content === undefined || content === null || content === "" || content === false;

function Body({ content, children, side = "top", align = "center", composed }: TipProps) {
  // Inside a modal <dialog> the tip must render in it: the dialog's top layer hides anything in <body>.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const anchor = useCallback((el: HTMLElement | null) => setHost(el?.closest("dialog") ?? null), []);
  const props = children.props as { disabled?: unknown; children?: ReactNode };
  const empty = isEmpty(content);
  // A disabled control fires no pointer events: a span carries its tip, focusable while the control is not.
  // A control that can be disabled keeps the span while enabled, so toggling never remounts it (focus, refs).
  const trigger = typeof props.disabled === "boolean"
    ? <Tooltip.Trigger asChild ref={anchor} onFocus={onFocus} onPointerMove={claim}>
      <span className="tip-anchor" tabIndex={props.disabled && !empty ? 0 : undefined}>{children}</span></Tooltip.Trigger>
    : composed
      ? cloneElement(children as ReactElement<{ asChild?: boolean }>, { asChild: true },
        <Tooltip.Trigger ref={anchor} onFocus={onFocus} onPointerMove={claim}>{props.children}</Tooltip.Trigger>)
      : <Tooltip.Trigger asChild ref={anchor} onFocus={onFocus} onPointerMove={claim}>{children}</Tooltip.Trigger>;
  return (
    <Tooltip.Root open={empty ? false : undefined}>
      {trigger}
      {empty ? null : <Tooltip.Portal container={host ?? undefined}>
        <Tooltip.Content className="tip" side={side} align={align} sideOffset={6} collisionPadding={10}>
          {content}
          {/* Only the two slanted sides are stroked: the arrow joins the border without a seam. */}
          <Tooltip.Arrow asChild><svg className="tip-arrow" width="12" height="6" viewBox="0 0 12 6" aria-hidden="true"><path d="M0 0L6 6L12 0" /></svg></Tooltip.Arrow>
        </Tooltip.Content>
      </Tooltip.Portal>}
    </Tooltip.Root>
  );
}

// The platform's tooltip, on any element: hover or keyboard focus opens it; Escape, leaving or pressing closes it.
function Tip(props: TipProps) {
  const scoped = useTipScope();
  // Once a tip has shown, its structure stays when the text goes: a control toggling its hint is never remounted.
  const [had, setHad] = useState(false);
  if (!had && !isEmpty(props.content)) setHad(true);
  if (!had && !props.steady && isEmpty(props.content)) return props.children;
  if (scoped) return <Body {...props} />;
  // Rendered outside the app's root provider (a test, a lone component): its own, with the same delays.
  return <Tooltip.Provider delayDuration={TIP_DELAY} skipDelayDuration={TIP_SKIP}><Body {...props} /></Tooltip.Provider>;
}

export default memo(Tip);
