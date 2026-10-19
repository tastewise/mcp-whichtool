import { memo } from "react";
import Tip from "./Tip";

interface Props { id?: string; fresh: number; onJump: () => void }

// Floats over a log scrolled up: back to the newest line, saying how many arrived meanwhile.
function JumpToLatest({ id, fresh, onJump }: Props) {
  const label = fresh > 0 ? `${fresh} new` : "Latest";
  return (
    <Tip content="Back to the newest line"><button type="button" id={id} className="jump-latest" onClick={onJump}
      aria-label={fresh > 0 ? `Jump to the newest line, ${fresh} new` : "Jump to the newest line"}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 2v7M2.5 6 6 9.5 9.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button></Tip>
  );
}

export default memo(JumpToLatest);
