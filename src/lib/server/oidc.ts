/* lib/server/oidc.ts
 * MIT Licence — (c) Clove Twilight
 */

import * as oauth from "oauth4webapi";

type OidcEnv = {
  OIDC_ISSUER: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
};

let cached: { issuer: string; server: oauth.AuthorizationServer } | null = null;

// Discovery document, kept per worker instance
async function authServer(env: OidcEnv) {
  if (cached?.issuer === env.OIDC_ISSUER) return cached.server;

  const issuer = new URL(env.OIDC_ISSUER);
  const response = await oauth.discoveryRequest(issuer, { algorithm: "oidc" });
  const server = await oauth.processDiscoveryResponse(issuer, response);
  cached = { issuer: env.OIDC_ISSUER, server };

  return server;
}

const clientOf = (env: OidcEnv): oauth.Client => ({ client_id: env.OIDC_CLIENT_ID });

export async function oidcLoginUrl(env: OidcEnv, redirectUri: string) {
  const server = await authServer(env);
  if (!server.authorization_endpoint) throw new Error("issuer has no authorization endpoint");

  const verifier = oauth.generateRandomCodeVerifier();
  const state = oauth.generateRandomState();
  const nonce = oauth.generateRandomNonce();

  const url = new URL(server.authorization_endpoint);
  url.searchParams.set("client_id", env.OIDC_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);

  return { url, state, verifier, nonce };
}

// Checks state, swaps the code, validates the id token; your auth server decides who may log in
export async function oidcCallback(
  env: OidcEnv,
  currentUrl: URL,
  redirectUri: string,
  expected: { state: string; verifier: string; nonce: string },
) {
  const server = await authServer(env);
  const client = clientOf(env);
  const params = oauth.validateAuthResponse(server, client, currentUrl, expected.state);

  const response = await oauth.authorizationCodeGrantRequest(
    server,
    client,
    oauth.ClientSecretPost(env.OIDC_CLIENT_SECRET),
    params,
    redirectUri,
    expected.verifier,
  );
  const result = await oauth.processAuthorizationCodeResponse(server, client, response, {
    expectedNonce: expected.nonce,
    requireIdToken: true,
  });
  const claims = oauth.getValidatedIdTokenClaims(result);
  if (!claims) throw new Error("no id token");

  return {
    sub: String(claims.sub),
    name: String(claims.name ?? claims.preferred_username ?? claims.sub),
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
