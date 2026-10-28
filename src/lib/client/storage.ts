/* lib/client/storage.ts
 * MIT Licence — (c) Clove Twilight
 */

const PREFIX = "clove-reviewer:";

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}
