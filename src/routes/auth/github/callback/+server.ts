/* routes/auth/github/callback/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { env } from "cloudflare:workers";
import { error, redirect } from "@sveltejs/kit";

import { checkAccess, exchangeGithubCode, githubUser } from "#lib/server/githubAuth.ts";
import { takePending, writeSession } from "#lib/server/session.ts";
import type { RequestHandler } from "./$types";

// Step 4: store the token, check org membership
export const GET: RequestHandler = async ({ url, locals }) => {
  const pending = await takePending(env.SESSIONS, url.searchParams.get("state"));
  const session = locals.session;

  if (!pending || pending.kind !== "github" || !session || pending.nonce !== locals.sessionId) {
    error(400, "github link expired, try again");
  }

  const code = url.searchParams.get("code");
  if (!code) error(400, url.searchParams.get("error_description") ?? "github didn't send a code");

  const token = await exchangeGithubCode(env, code, `${url.origin}/auth/github/callback`);
  const [user, access] = await Promise.all([githubUser(token), checkAccess(token)]);

  session.github = { token, ...user };
  session.access = access;
  await writeSession(env.SESSIONS, locals.sessionId!, session);

  redirect(303, access.register ? pending.returnTo : "/auth/denied");
};
