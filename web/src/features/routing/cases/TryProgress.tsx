import { memo, useEffect, useRef } from "react";
import ReadingProgress from "@/features/activity/ReadingProgress";

// No progress comes back from one routing request: the bar runs against the usual wait for this many calls.
function TryProgress({ id, calls, toBottom = false }: { id: string; calls: number; toBottom?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Under long proposals the bar starts out of sight: the drawer scrolls to its foot, or just far enough.
  useEffect(() => {
    if (!calls) return;
    const drawer = ref.current?.closest("dialog");
    if (toBottom && drawer) drawer.scrollTo?.({ top: drawer.scrollHeight, behavior: "smooth" });
    else ref.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [calls, toBottom]);
  if (!calls) return null;
  const expected = 3 + Math.ceil(calls / 8) * 3;
  return <div ref={ref} className="try-progress"><ReadingProgress id={id} expected={expected} label={`Routing ${calls} model call${calls > 1 ? "s" : ""}:`} /></div>;
}
export default memo(TryProgress);
