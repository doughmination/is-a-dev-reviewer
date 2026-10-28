/* lib/server/githubAuth.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { Access, GithubLink } from "./session.ts";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "clove-reviewer";
// read:org to see org membership, public_repo to comment, label, approve and merge
const SCOPES = "read:org public_repo";

export const ACCESS_RECHECK_MS = 10 * 60_000;

type GithubEnv = {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
};

export function githubLoginUrl(env: GithubEnv, redirectUri: string, state: string) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url;
}

export async function exchangeGithubCode(env: GithubEnv, code: string, redirectUri: string) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = await response.json<{ access_token?: string; error_description?: string }>();

  if (!body.access_token) throw new Error(body.error_description ?? "github didn't return a token");
  return body.access_token;
}

async function githubGet(token: string, path: string) {
  return fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

// Active membership only: contributors and outside collaborators don't get one
async function isActiveMember(token: string, org: string) {
  const response = await githubGet(token, `/user/memberships/orgs/${org}`);
  if (!response.ok) return false;

  const membership = await response.json<{ state: string; role: string }>();
  return membership.state === "active" && ["member", "admin"].includes(membership.role);
}

async function canPush(token: string, repo: string) {
  const response = await githubGet(token, `/repos/${repo}`);
  if (!response.ok) return false;

  const info = await response.json<{ permissions?: { push?: boolean } }>();
  return !!info.permissions?.push;
}

export async function githubUser(token: string): Promise<Omit<GithubLink, "token">> {
  const response = await githubGet(token, "/user");
  if (!response.ok) throw new Error(`github /user: ${response.status}`);

  const user = await response.json<{ login: string; id: number; name: string | null; avatar_url: string }>();
  return {
    login: user.login,
    id: user.id,
    name: user.name ?? user.login,
    avatar: user.avatar_url,
  };
}

export async function checkAccess(token: string): Promise<Access> {
  const [register, freeDomains, botPush] = await Promise.all([
    isActiveMember(token, "is-a-dev"),
    isActiveMember(token, "free-domains"),
    canPush(token, "free-domains/is-a.bot"),
  ]);

  return {
    register,
    bot: freeDomains && botPush,
    checkedAt: Date.now(),
  };
}
