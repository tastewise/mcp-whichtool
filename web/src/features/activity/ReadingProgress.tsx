import { memo, useEffect, useState } from "react";
import { Muted, Progress } from "@/components/_ui";

// A wait that reports no progress of its own: the test runs' endless green bar, and the seconds against the usual wait.
function ReadingProgress({ id, expected, label }: { id: string; expected: number; label: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="reading-progress">
      <Progress id={id} max={expected} value={null} ariaLabel={label} />
      <Muted as="p">{`${label} ${elapsed} s of about ${expected} s.`}</Muted>
    </div>
  );
}

export default memo(ReadingProgress);
