import { memo, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Tip from "./Tip";

export const drawerVariants = cva("run-drawer", { variants: { kind: { plain: "" } }, defaultVariants: { kind: "plain" } });

export type DrawerProps = VariantProps<typeof drawerVariants> & {
  id: string; labelledBy: string; open: boolean; onClose: () => void; className?: string; children: ReactNode;
  // A click on the backdrop closes it: for a drawer that only shows, never one holding an edit.
  closeOnOutside?: boolean;
};

// One width for every drawer, remembered in this browser only.
const widthKey = "console.drawer.width";
const minWidth = 360;
const readWidth = () => { try { const w = Number(localStorage.getItem(widthKey)); return w >= minWidth ? w : null; } catch { return null; } };
const saveWidth = (w: number | null) => { try { if (w) localStorage.setItem(widthKey, String(w)); else localStorage.removeItem(widthKey); } catch { /* no storage */ } };
const clamp = (w: number) => Math.round(Math.min(Math.max(w, minWidth), window.innerWidth - 48));

// The backdrop's clicks land on the dialog itself, outside the box it draws.
const outside = (event: MouseEvent<HTMLDialogElement>) => {
  if (event.target !== event.currentTarget) return false;
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
};

// <dialog class="run-drawer"> opened with showModal(), as every old page does; its left edge drags it wider.
function Drawer({ kind, id, labelledBy, open, onClose, className, children, closeOnOutside = false }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [width, setWidth] = useState<number | null>(readWidth);
  // A drag that ends over the backdrop fires a click there: it must not close the drawer.
  const dragged = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const grab = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragged.current = true;
  };
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) setWidth(clamp(window.innerWidth - event.clientX));
  };
  const drop = () => { setWidth((w) => { saveWidth(w); return w; }); setTimeout(() => { dragged.current = false; }); };
  const reset = () => { setWidth(null); saveWidth(null); };
  const style = width ? ({ "--drawer-w": `${width}px` } as CSSProperties) : undefined;
  return <dialog ref={ref} id={id} className={cn(drawerVariants({ kind }), className)} aria-labelledby={labelledBy} onClose={onClose} style={style}
    onClick={closeOnOutside ? (event) => { if (!dragged.current && outside(event)) onClose(); } : undefined}>
    <Tip content="Drag to resize · double-click to reset" side="left"><div className="drawer-grip" role="separator" aria-orientation="vertical" aria-label="Resize the panel"
      onPointerDown={grab} onPointerMove={drag} onPointerUp={drop} onPointerCancel={drop} onDoubleClick={reset} /></Tip>
    {children}
  </dialog>;
}

export default memo(Drawer);
