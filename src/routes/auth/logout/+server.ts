/* routes/auth/logout/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { env } from "cloudflare:workers";
import { redirect } from "@sveltejs/kit";

import { deleteSession, SESSION_COOKIE } from "#lib/server/session.ts";
import type { RequestHandler } from "./$types";

// POST only, so a link or image can't sign someone out
export const POST: RequestHandler = async ({ locals, cookies }) => {
  if (locals.sessionId) await deleteSession(env.SESSIONS, locals.sessionId);
  cookies.delete(SESSION_COOKIE, { path: "/" });
  redirect(303, "/auth/signed-out");
};
