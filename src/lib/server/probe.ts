/* lib/server/probe.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { Probe } from "#lib/core/types.ts";

export const BROWSER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";

const TIMEOUT_MS = 12_000;
const TITLE_LIMIT = 160;
// Only the head matters for a title
const READ_LIMIT = 256 * 1024;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&#x27;": "'",
  "&middot;": "·",
  "&nbsp;": " ",
  "&ndash;": "-",
  "&mdash;": "-",
  "&bull;": "•",
};

const decodeEntities = (text: string) => text.replace(/&[#\w]+;/g, (entity) => ENTITIES[entity] ?? entity);

export function readTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim();
  return title ? decodeEntities(title).slice(0, TITLE_LIMIT) : null;
}

// Frameable means no x-frame-options and no frame-ancestors that would block us
export function isFrameable(headers: Headers) {
  const frameOptions = headers.get("x-frame-options") ?? "";
  const policy = (headers.get("content-security-policy") ?? "").toLowerCase();

  const policyBlocks = policy.split(";").some((directive) => {
    const trimmed = directive.trim();
    return trimmed.startsWith("frame-ancestors")
      && !trimmed.includes("*")
      && !trimmed.includes("http:");
  });

  return !frameOptions && !policyBlocks;
}

async function readHead(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let text = "";
  while (text.length < READ_LIMIT) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});

  return text;
}

export async function probeSite(url: string): Promise<Probe> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": BROWSER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = await readHead(response).catch(() => "");

    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      finalUrl: response.url || url,
      frameable: isFrameable(response.headers),
      title: readTitle(html),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      frameable: false,
      title: null,
      error: String(error),
    };
  }
}
