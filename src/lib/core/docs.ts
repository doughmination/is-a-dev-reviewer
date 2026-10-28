/* lib/core/docs.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { Github } from "./github.ts";

export type DocEntry = {
  id: string;
  source: "Terms" | "Docs" | "Reviewing" | "FAQ";
  path: string[]; // heading trail
  text: string;
  url: string;
};

const SOURCES: { source: DocEntry["source"]; repo: string; path: string; base: string }[] = [
  { source: "Terms", repo: "is-a-dev/register", path: "TERMS_OF_SERVICE.md", base: "https://is-a.dev/terms" },
  { source: "Reviewing", repo: "is-a-dev/docs", path: "src/maintainers/reviewing-prs.md", base: "https://docs.is-a.dev/maintainers/reviewing-prs/" },
  { source: "FAQ", repo: "is-a-dev/docs", path: "src/useful/faq.md", base: "https://docs.is-a.dev/faq/" },
  { source: "Docs", repo: "is-a-dev/docs", path: "src/useful/domain-structure.md", base: "https://docs.is-a.dev/domain-structure/" },
  { source: "Docs", repo: "is-a-dev/docs", path: "src/quickstart.md", base: "https://docs.is-a.dev/quickstart/" },
];

const KEY = "clove-reviewer:docs";
const TTL = 12 * 3600 * 1000;

const anchor = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

const clean = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\^\d+\]:?/g, "")
    .replace(/[*_`]+/g, "")
    .replace(/^!!!.*$/gm, "")
    .trim();

function split(md: string, source: DocEntry["source"], base: string): DocEntry[] {
  md = md.replace(/^---[\s\S]*?---\n/, "");
  const out: DocEntry[] = [];
  const trail: string[] = [];
  let buf: string[] = [];
  let hAnchor = "";

  const flush = () => {
    const body = buf.join("\n");
    buf = [];
    if (!trail.length) return;
    const url = hAnchor && source !== "Terms" ? `${base}#${hAnchor}` : base;
    const items = body.split("\n").filter((l) => /^\s*(\d+\.|[-*])\s+/.test(l));
    const intro = clean(body.split("\n").filter((l) => !/^\s*(\d+\.|[-*])\s+/.test(l)).join("\n"));
    if (intro || !items.length) out.push({ id: `${source}${out.length}`, source, path: [...trail], text: intro || clean(body), url });
    // every list item is its own hit, the terms "prohibited" list is mostly one liners
    for (const it of items) {
      const t = clean(it.replace(/^\s*(\d+\.|[-*])\s+/, ""));
      if (t.length > 3) out.push({ id: `${source}${out.length}`, source, path: [...trail], text: t, url });
    }
  };

  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,4})\s+(.+)/);
    if (h) {
      flush();
      const depth = h[1].length;
      trail.length = Math.max(0, depth - 1);
      trail[depth - 1] = clean(h[2]);
      for (let i = 0; i < trail.length; i++) trail[i] ??= "";
      hAnchor = anchor(clean(h[2]));
    } else buf.push(line);
  }
  flush();
  return out.map((e) => ({ ...e, path: e.path.filter(Boolean).slice(-2) }));
}

export async function loadDocs(github: Github, force = false): Promise<DocEntry[]> {
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || "null");
      if (c && Date.now() - c.at < TTL && c.entries?.length) return c.entries;
    } catch {}
  }
  const parts = await Promise.all(
    SOURCES.map((s) =>
      github
        .raw(s.repo, s.path)
        .then((md) => split(md, s.source, s.base))
        .catch(() => [] as DocEntry[]),
    ),
  );
  const entries = parts.flat();
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), entries }));
  } catch {}
  return entries;
}

export function searchDocs(entries: DocEntry[], q: string): DocEntry[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = entries
    .map((e) => {
      const head = e.path.join(" ").toLowerCase();
      const text = e.text.toLowerCase();
      let score = 0;
      for (const w of words) {
        const inHead = head.includes(w);
        const inText = text.includes(w);
        if (!inHead && !inText) return null;
        score += (inHead ? 3 : 0) + (inText ? 1 : 0) + (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text) ? 1 : 0);
      }
      // short, specific entries first
      score += Math.max(0, 2 - e.text.length / 300);
      return { e, score };
    })
    .filter(Boolean) as { e: DocEntry; score: number }[];
  return scored.sort((a, b) => b.score - a.score).slice(0, 30).map((x) => x.e);
}

export const TOPICS = ["prohibited", "commercial", "NS records", "nested", "login page", "blog", "AI", "courses", "proxy", "owner", "preview", "instantly close"];
