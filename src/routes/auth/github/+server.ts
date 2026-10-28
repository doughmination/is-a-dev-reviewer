/* routes/auth/github/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { env } from "cloudflare:workers";
import { redirect } from "@sveltejs/kit";

import { githubLoginUrl } from "#lib/server/githubAuth.ts";
import { newId, safeReturnTo, savePending } from "#lib/server/session.ts";
import type { RequestHandler } from "./$types";

// Step 3: link GitHub, needs an OIDC session first
export const GET: RequestHandler = async ({ url, locals }) => {
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  if (!locals.session) redirect(303, `/auth/login?returnTo=${encodeURIComponent(returnTo)}`);

  const state = newId();

  await savePending(env.SESSIONS, state, {
    kind: "github",
    verifier: "",
    // Ties the callback to this session, not just to whoever holds the state
    nonce: locals.sessionId!,
    returnTo,
  });

  redirect(303, githubLoginUrl(env, `${url.origin}/auth/github/callback`, state).toString(), {
    external: ["https://github.com"],
  });
};
