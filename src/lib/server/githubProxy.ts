/* lib/server/githubProxy.ts
 * MIT Licence — (c) Clove Twilight
 */

import { PROFILES } from "#lib/core/profiles.ts";
import type { Session } from "./session.ts";

const GITHUB_API = "https://api.github.com";
const READ_METHODS = new Set(["GET", "HEAD"]);

// Headers worth passing through in either direction
const REQUEST_HEADERS = ["accept", "content-type", "x-github-api-version"];
const RESPONSE_HEADERS = ["content-type", "link", "x-ratelimit-remaining", "x-ratelimit-reset"];

export type ProxyVerdict = { ok: true } | { ok: false; status: number; reason: string };

// Which repos this session may change, by tab access
function writableRepos(session: Session) {
  const repos: string[] = [];
  if (session.access?.register) repos.push(PROFILES.register.repo);
  if (session.access?.bot) repos.push(PROFILES.bot.repo);
  return repos;
}

// Reads go anywhere the token can see; writes only into repos this person reviews
export function checkProxyRequest(session: Session, method: string, path: string, body: string | null): ProxyVerdict {
  if (path.includes("..")) return { ok: false, status: 400, reason: "bad path" };

  if (path === "/graphql") {
    if (method !== "POST") return { ok: false, status: 405, reason: "graphql is POST only" };
    // Queries only, every change goes through the REST checks below
    const query = (() => {
      try {
        return String(JSON.parse(body ?? "{}").query ?? "");
      } catch {
        return "";
      }
    })();
    if (/\bmutation\b/.test(query)) return { ok: false, status: 403, reason: "graphql mutations aren't proxied" };
    return { ok: true };
  }

  if (READ_METHODS.has(method)) return { ok: true };

  const allowed = writableRepos(session).some((repo) => path.startsWith(`/repos/${repo}/`));
  if (!allowed) return { ok: false, status: 403, reason: "no write access to that repo here" };

  return { ok: true };
}

export async function forwardToGithub(session: Session, request: Request, path: string, search: string) {
  const body = READ_METHODS.has(request.method) ? null : await request.text();
  const verdict = checkProxyRequest(session, request.method, path, body);
  if (!verdict.ok) return new Response(verdict.reason, { status: verdict.status });

  const headers = new Headers({
    Authorization: `Bearer ${session.github!.token}`,
    "User-Agent": "clove-reviewer",
  });
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = await fetch(`${GITHUB_API}${path}${search}`, {
    method: request.method,
    headers,
    body,
  });

  const responseHeaders = new Headers({ "Cache-Control": "no-store" });
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
