export function ago(epochSeconds?: number | null): string {
  if (!epochSeconds) return "never";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds));
  if (seconds < 60) return seconds + "s ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + " min ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
  return Math.floor(seconds / 86400) + "d ago";
}

export function remaining(seconds: number): string {
  if (seconds <= 0) return "expired";
  if (seconds < 3600) return Math.floor(seconds / 60) + " min left";
  if (seconds < 172800) return Math.floor(seconds / 3600) + "h left";
  return Math.floor(seconds / 86400) + "d left";
}

export function dateLabel(stamp?: number | null): string {
  return stamp
    ? new Date(stamp * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Time unavailable";
}

export function costLabel(cost?: number | null): string {
  return cost === null || cost === undefined
    ? "Not priced"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cost);
}
