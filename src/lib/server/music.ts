/* lib/server/music.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { MusicItem } from "#lib/core/types.ts";

const PLAYABLE: Record<string, string> = {
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".opus": "audio/ogg",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
};

const extensionOf = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();

// Plain file names only: no paths, no dotfiles
export function isPlayableName(name: string) {
  return !!name
    && name.length < 250
    && !name.startsWith(".")
    && !/[\/\\]/.test(name)
    && extensionOf(name) in PLAYABLE;
}

export const contentTypeOf = (name: string) => PLAYABLE[extensionOf(name)] ?? "application/octet-stream";

// Each GitHub account gets its own folder in the bucket
const prefixFor = (githubId: number) => `music/${githubId}/`;
const keyFor = (githubId: number, name: string) => `${prefixFor(githubId)}${name}`;

// Bytes for a "Range: bytes=start-end" header, null when absent or unusable
export function parseRange(header: string | null, size: number) {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;

  let start: number;
  let end: number;

  if (!match[1]) {
    // Suffix form: the last N bytes
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }

  return start <= end && start < size ? { start, end } : null;
}

const titleOf = (name: string) =>
  name
    .slice(0, name.lastIndexOf("."))
    .replace(/\s*\[[\w-]{11}\]$/, "");

export async function listMusic(bucket: R2Bucket, githubId: number): Promise<MusicItem[]> {
  const items: MusicItem[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix: prefixFor(githubId), cursor });
    for (const object of page.objects) {
      const name = object.key.slice(prefixFor(githubId).length);
      items.push({
        name,
        title: titleOf(name),
        url: `/api/music/${encodeURIComponent(name)}`,
        size: object.size,
        addedAt: object.uploaded.getTime(),
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return items.sort((first, second) => first.title.localeCompare(second.title));
}

export async function streamMusic(bucket: R2Bucket, githubId: number, name: string, rangeHeader: string | null) {
  if (!isPlayableName(name)) return new Response("not found", { status: 404 });

  const head = await bucket.head(keyFor(githubId, name));
  if (!head) return new Response("not found", { status: 404 });

  const range = parseRange(rangeHeader, head.size);
  const object = await bucket.get(keyFor(githubId, name), range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : {});
  if (!object) return new Response("not found", { status: 404 });

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": contentTypeOf(name),
    "Cache-Control": "private, max-age=3600",
  });

  if (!range) {
    headers.set("Content-Length", String(head.size));
    return new Response(object.body, { headers });
  }

  headers.set("Content-Length", String(range.end - range.start + 1));
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${head.size}`);
  return new Response(object.body, { status: 206, headers });
}

export async function storeMusic(bucket: R2Bucket, githubId: number, name: string, request: Request) {
  if (!isPlayableName(name)) return new Response("can't play that, try webm, mp4 or an audio file", { status: 400 });
  if (!request.body || !request.headers.get("content-length")) return new Response("empty upload", { status: 400 });

  await bucket.put(keyFor(githubId, name), request.body, {
    httpMetadata: { contentType: contentTypeOf(name) },
  });

  return new Response(null, { status: 204 });
}

export async function deleteMusic(bucket: R2Bucket, githubId: number, name: string) {
  if (!isPlayableName(name)) return new Response("not found", { status: 404 });
  await bucket.delete(keyFor(githubId, name));
  return new Response(null, { status: 204 });
}
