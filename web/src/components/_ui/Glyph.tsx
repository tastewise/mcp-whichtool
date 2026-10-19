import { memo } from "react";

export const GLYPH = {
  prev: '<path d="M9.8 3.2 5 8l4.8 4.8"/>',
  next: '<path d="M6.2 3.2 11 8l-4.8 4.8"/>',
  edit: '<path d="M11.3 2.6 13.4 4.7 5.6 12.5 2.7 13.3 3.5 10.4z"/>',
  delete: '<path d="M3.4 4.6h9.2M6.4 4.6V3.1h3.2v1.5M4.9 4.6l.6 8.5h5l.6-8.5"/>',
  restart: '<path d="M2 8a6 6 0 0 1 6-6 6.5 6.5 0 0 1 4.5 1.8L14 5.3M14 2v3.3h-3.3M14 8a6 6 0 0 1-6 6 6.5 6.5 0 0 1-4.5-1.8L2 10.7M2 14v-3.3h3.3"/>',
  plug: '<path d="M6 1.6v3.4M10 1.6v3.4M3.9 5h8.2v2.1a4.1 4.1 0 0 1-8.2 0zM8 11.2v3.2"/>',
  check: '<path d="M3.2 8.4 6.4 11.6 12.8 4.8"/>',
  scan: '<circle cx="7" cy="7" r="4.4"/><path d="M10.3 10.3 13.6 13.6"/>',
  clear: '<path d="M4 4l8 8M12 4l-8 8"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1.2"/>',
  download: '<path d="M8 2.4v7.8M4.8 7 8 10.2 11.2 7M3 12.4v1.2h10v-1.2"/>',
} as const;

export type GlyphKind = keyof typeof GLYPH;

// ui.js glyph(): the 12 px icon a button puts before its label.
function Glyph({ kind }: { kind: GlyphKind }) {
  return (
    <span className="ico">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: GLYPH[kind] }} />
    </span>
  );
}

export default memo(Glyph);
