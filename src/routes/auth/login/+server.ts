/* routes/auth/login/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { env } from "cloudflare:workers";
import { error, redirect } from "@sveltejs/kit";

import { oidcLoginUrl } from "#lib/server/oidc.ts";
import { safeReturnTo, savePending } from "#lib/server/session.ts";
import type { RequestHandler } from "./$types";

// Step 1: off to your auth server
export const GET: RequestHandler = async ({ url }) => {
  let login;
  try {
    login = await oidcLoginUrl(env, `${url.origin}/auth/callback`);
  } catch (cause) {
    error(502, `can't reach the auth server at ${env.OIDC_ISSUER} (check OIDC_ISSUER): ${cause instanceof Error ? cause.message : cause}`);
  }

  await savePending(env.SESSIONS, login.state, {
    kind: "oidc",
    verifier: login.verifier,
    nonce: login.nonce,
    returnTo: safeReturnTo(url.searchParams.get("returnTo")),
  });

  // Kit 3 refuses external redirects unless the origin is allowed explicitly
  redirect(303, login.url.toString(), { external: [new URL(env.OIDC_ISSUER).origin] });
};
