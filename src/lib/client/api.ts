/* lib/client/api.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { MusicItem, Probe } from "#lib/core/types.ts";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}

// Calls into the worker; GitHub itself goes through the Github client at /api/gh
export const api = {
  probeSite: (url: string) => getJson<Probe>(`/api/probe?url=${encodeURIComponent(url)}`),

  jobLog: (repo: string, job: number) => getJson<string[]>(`/api/joblog?repo=${encodeURIComponent(repo)}&job=${job}`),

  screenshotUrl: (url: string, waitMs = 3500) => `/api/screenshot?url=${encodeURIComponent(url)}&wait=${waitMs}`,

  musicList: () => getJson<MusicItem[]>("/api/music"),

  async musicUpload(file: File) {
    const response = await fetch(`/api/music/${encodeURIComponent(file.name)}`, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) throw new Error(await response.text());
  },

  async musicDelete(name: string) {
    const response = await fetch(`/api/music/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(await response.text());
  },
};

export function openExternal(url: string) {
  if (/^https?:\/\//.test(url)) window.open(url, "_blank", "noopener,noreferrer");
}
