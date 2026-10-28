/* lib/core/time.ts
 * MIT Licence — (c) Clove Twilight
 */

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

// Short age label: "now", "5m", "3h", "2d", "4mo"
export function ago(iso: string, now = Date.now()) {
  const seconds = (now - new Date(iso).getTime()) / 1000;

  if (seconds < MINUTE) return "now";
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`;
  if (seconds < DAY * 30) return `${Math.floor(seconds / DAY)}d`;

  return `${Math.floor(seconds / DAY / 30)}mo`;
}

// "5m ago", but plain "now" stays "now"
export function agoPhrase(iso: string, now = Date.now()) {
  const label = ago(iso, now);
  return label === "now" ? label : `${label} ago`;
}
