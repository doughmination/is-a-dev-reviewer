/* routes/api/screenshot/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { env, waitUntil } from "cloudflare:workers";

import { screenshot } from "#lib/server/screenshot.ts";
import type { RequestHandler } from "./$types";

// Bun's test types also declare `caches`, without Cloudflare's default cache
const edgeCache = () => (caches as unknown as { default: Cache }).default;

export const GET: RequestHandler = async ({ url }) => {
  const target = url.searchParams.get("url") ?? "";
  const waitMs = Number(url.searchParams.get("wait") ?? 3500);

  try {
    return await screenshot(env.BROWSER, edgeCache(), target, waitMs, waitUntil);
  } catch (cause) {
    return new Response(`screenshot failed: ${cause instanceof Error ? cause.message : cause}`, { status: 502 });
  }
};
