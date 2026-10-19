import { memo } from "react";

// The small marks buttons carry, shipped with the page.
const BASE = import.meta.env.BASE_URL;
export const MARK = {
  ai: { src: `${BASE}marks/ai.svg`, width: 16, height: 16 },
} as const;

export type MarkName = keyof typeof MARK;

function Mark({ name }: { name: MarkName }) {
  return <img src={MARK[name].src} alt="" width={MARK[name].width} height={MARK[name].height} />;
}

export default memo(Mark);
