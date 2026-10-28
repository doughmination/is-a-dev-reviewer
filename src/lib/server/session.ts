/* lib/server/session.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { Cookies } from "@sveltejs/kit";

export const SESSION_COOKIE = "reviewer_session";
const SESSION_TTL_SECONDS = 7 * 24 * 3600;
const PENDING_TTL_SECONDS = 600;

export type Access = {
  // Active member of is-a-dev
  register: boolean;
  // Active member of free-domains with push on free-domains/is-a.bot
  bot: boolean;
  checkedAt: number;
};

export type GithubLink = {
  token: string;
  login: string;
  id: number;
  name: string;
  avatar: string;
};

export type Session = {
  // OIDC subject, the identity your auth server vouched for
  sub: string;
  name: string;
  email: string | null;
  github: GithubLink | null;
  access: Access | null;
  createdAt: number;
};

// Short-lived state between redirect and callback
export type PendingLogin = {
  kind: "oidc" | "github";
  verifier: string;
  nonce: string;
  returnTo: string;
};

const sessionKey = (id: string) => `session:${id}`;
const pendingKey = (state: string) => `pending:${state}`;

export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (char) => ({ "+": "-", "/": "_", "=": "" })[char]!);
}

export async function readSession(store: KVNamespace, id: string | undefined) {
  if (!id) return null;
  return store.get<Session>(sessionKey(id), "json");
}

export async function writeSession(store: KVNamespace, id: string, session: Session) {
  await store.put(sessionKey(id), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession(store: KVNamespace, id: string) {
  await store.delete(sessionKey(id));
}

export function setSessionCookie(cookies: Cookies, id: string) {
  cookies.set(SESSION_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function savePending(store: KVNamespace, state: string, pending: PendingLogin) {
  await store.put(pendingKey(state), JSON.stringify(pending), {
    expirationTtl: PENDING_TTL_SECONDS,
  });
}

// One use only: read and delete
export async function takePending(store: KVNamespace, state: string | null) {
  if (!state) return null;
  const pending = await store.get<PendingLogin>(pendingKey(state), "json");
  if (pending) await store.delete(pendingKey(state));
  return pending;
}

// Only same-site paths, so a crafted link can't bounce people elsewhere after login
export function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
