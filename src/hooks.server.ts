/* hooks.server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { env } from "cloudflare:workers";
import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";

import { ACCESS_RECHECK_MS, checkAccess } from "#lib/server/githubAuth.ts";
import {
  readSession,
  SESSION_COOKIE,
  writeSession,
} from "#lib/server/session.ts";

const PUBLIC_PREFIXES = ["/auth/", "/welcome"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const isApi = (path: string) => path.startsWith("/api/");

function deny(path: string, status: number, message: string, to: string) {
  if (isApi(path)) return new Response(message, { status });
  redirect(303, to);
}

export const handle: Handle = async ({ event, resolve }) => {
  const { url, cookies, request } = event;
  const path = url.pathname;

  event.locals.sessionId = cookies.get(SESSION_COOKIE) ?? null;
  event.locals.session = await readSession(
    env.SESSIONS,
    event.locals.sessionId ?? undefined,
  );

  // Cookie-authed writes must come from this site
  if (
    isApi(path) &&
    !SAFE_METHODS.has(request.method) &&
    request.headers.get("origin") !== url.origin
  ) {
    return new Response("cross-site request refused", { status: 403 });
  }

  if (!PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    const session = event.locals.session;
    const returnTo = encodeURIComponent(path + url.search);

    if (!session) {
      // The welcome page carries the link preview, so crawlers land there too
      const denied = deny(
        path,
        401,
        "sign in first",
        `/welcome?returnTo=${returnTo}`,
      );
      if (denied) return denied;
    }

    if (session && !session.github) {
      const denied = deny(
        path,
        401,
        "link github first",
        `/auth/github?returnTo=${returnTo}`,
      );
      if (denied) return denied;
    }

    // Org membership can change, so look again every few minutes
    if (
      session?.github &&
      (!session.access ||
        Date.now() - session.access.checkedAt > ACCESS_RECHECK_MS)
    ) {
      session.access = await checkAccess(session.github.token);
      await writeSession(env.SESSIONS, event.locals.sessionId!, session);
    }

    if (session && !session.access?.register) {
      const denied = deny(path, 403, "not an is-a-dev member", "/auth/denied");
      if (denied) return denied;
    }
  }

  const response = await resolve(event);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
};
