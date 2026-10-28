/* routes/auth/callback/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { env } from "cloudflare:workers";
import { error, redirect } from "@sveltejs/kit";

import { oidcCallback } from "#lib/server/oidc.ts";
import { newId, setSessionCookie, takePending, writeSession } from "#lib/server/session.ts";
import type { RequestHandler } from "./$types";

// Step 2: your auth server said yes, start a session and go link GitHub
export const GET: RequestHandler = async ({ url, cookies }) => {
  const state = url.searchParams.get("state");
  const pending = await takePending(env.SESSIONS, state);

  if (!pending || pending.kind !== "oidc") error(400, "login expired, try again");

  let identity;
  try {
    identity = await oidcCallback(env, url, `${url.origin}/auth/callback`, {
      state: state!,
      verifier: pending.verifier,
      nonce: pending.nonce,
    });
  } catch (cause) {
    error(401, `sign in failed: ${cause instanceof Error ? cause.message : cause}`);
  }

  const id = newId();
  await writeSession(env.SESSIONS, id, {
    ...identity,
    github: null,
    access: null,
    createdAt: Date.now(),
  });
  setSessionCookie(cookies, id);

  redirect(303, `/auth/github?returnTo=${encodeURIComponent(pending.returnTo)}`);
};
