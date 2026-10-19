import { memo } from "react";

export const ICON = {
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 3.2A1.7 1.7 0 0 0 8.9 2H3.7A1.7 1.7 0 0 0 2 3.7v5.2c0 .75.48 1.39 1.2 1.6"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  // An arrow into a tray: files going in.
  upload: '<path d="M8 10.6V2.4M4.8 5.4 8 2.4l3.2 3"/><path d="M2.4 10.2v2.2c0 .8.6 1.4 1.4 1.4h8.4c.8 0 1.4-.6 1.4-1.4v-2.2"/>',
  // A magnifier: read a server's tools.
  scan: '<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4 14 14"/>',
  // A ! in a circle: something stands in the way.
  alert: '<circle cx="8" cy="8" r="6"/><path d="M8 4.8v4"/><circle cx="8" cy="11.1" r=".5" fill="currentColor"/>',
  note: '<path d="M3.4 2.6h6l3 3v7.8h-9z"/><path d="M5.6 7.4h4.8M5.6 10h3.2"/>',
} as const;

export type IconName = keyof typeof ICON;

export interface IconProps { html: string; size?: number; width?: number; join?: boolean }

// The stroked 16-unit box every header, topbar and view-tab icon is drawn in.
function Icon({ html, size = 16, width = 1.5, join = true }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth={width} strokeLinecap="round" strokeLinejoin={join ? "round" : undefined} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export default memo(Icon);
