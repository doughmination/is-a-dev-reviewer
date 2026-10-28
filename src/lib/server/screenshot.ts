/* lib/server/screenshot.ts
 * MIT Licence — (c) Clove Twilight
 */

import puppeteer from "@cloudflare/puppeteer";

const VIEWPORT = {
  width: 1440,
  height: 900,
};
const NAVIGATION_TIMEOUT_MS = 20_000;
const MAX_WAIT_MS = 9000;
const CACHE_SECONDS = 6 * 3600;

type BrowserBinding = Parameters<typeof puppeteer.launch>[0];

const cacheKey = (url: string, waitMs: number) =>
  new Request(`https://screenshot.cache/${encodeURIComponent(url)}?wait=${waitMs}`);

async function capture(browserBinding: Cloudflare.Env["BROWSER"], url: string, waitMs: number) {
  // The wrangler binding is the BrowserWorker puppeteer expects, the types just disagree on fetch
  const browser = await puppeteer.launch(browserBinding as unknown as BrowserBinding);

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    // Let intro animations finish
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    return (await page.screenshot({ type: "jpeg", quality: 75 })) as Uint8Array<ArrayBuffer>;
  } finally {
    await browser.close();
  }
}

// Cloudflare Browser Rendering, cached at the edge for a few hours
export async function screenshot(
  browserBinding: Cloudflare.Env["BROWSER"],
  cache: Cache,
  url: string,
  waitMs: number,
  waitUntil: (promise: Promise<unknown>) => void,
) {
  if (!/^https?:\/\//.test(url)) return new Response("bad url", { status: 400 });

  const wait = Math.min(Math.max(waitMs, 0), MAX_WAIT_MS);
  const key = cacheKey(url, wait);
  const hit = await cache.match(key);
  if (hit) return hit;

  const image = await capture(browserBinding, url, wait);
  const response = new Response(image, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": `private, max-age=${CACHE_SECONDS}`,
    },
  });

  waitUntil(cache.put(key, response.clone()));
  return response;
}
