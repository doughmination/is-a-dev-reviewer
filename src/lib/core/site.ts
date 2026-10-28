/* lib/core/site.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { Pages, Probe } from "./types.ts";

export type SiteKind =
  | "site"
  | "github"
  | "isadev"
  | "down"
  | "locked"
  | "cname";

// pages + sourceUrl: a github pages site already redirecting to its is-a.dev name, shown from the repo
export type SiteInfo = {
  status: number;
  finalUrl: string;
  kind: SiteKind;
  title: string | null;
  pages?: Pages | null;
  sourceUrl?: string | null;
};

export function hostOf(url: string) {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export const isGithub = (url: string) => hostOf(url) === "github.com";

const escapeDots = (service: string) => service.replace(/\./g, "\\.");

// On the service domain itself (alice.is-a.dev), or its homepage (is-a.dev)
export const isOnService = (url: string, service: string) =>
  new RegExp(`(^|\\.)${escapeDots(service)}$`).test(hostOf(url));

const isServiceHome = (url: string, service: string) =>
  new RegExp(`^(www\\.)?${escapeDots(service)}$`).test(hostOf(url));

// project-abc123xyz-team.vercel.app is one deployment behind a login, production is project.vercel.app
export function vercelDeploy(url: string): string | null {
  const host = hostOf(url);
  const hashed = /^([a-z0-9-]+?)-(?:(?=[a-z]*\d)(?=\d*[a-z])[a-z0-9]{9}|git-[a-z0-9-]+)-[a-z0-9-]+\.vercel\.app$/;
  const team = /^([a-z0-9-]+?)-[a-z0-9-]+-projects\.vercel\.app$/;
  const match = host.match(hashed) ?? host.match(team);

  return match ? `https://${match[1]}.vercel.app` : null;
}

// Vercel deployment protection: bounces to vercel.com/login, or a 401 auth page
export function vercelLocked(url: string, probe: Probe | null) {
  if (!probe) return false;

  try {
    const final = new URL(probe.finalUrl || url);
    const onVercel = /(^|\.)vercel\.com$/.test(final.host);
    const loginPath = /^\/(login|sso-api|signup|request-access|sso)/.test(final.pathname);
    if (onVercel && loginPath) return true;
  } catch {}

  return /\.vercel\.app$/.test(hostOf(url))
    && [401, 403].includes(probe.status)
    && /vercel|authenticat|log ?in|access/i.test(probe.title ?? "");
}

// A working subdomain is fine, only flag the service homepage or a service link that won't load
export function kindOf(url: string, probe: Probe | null, service = "is-a.dev"): SiteKind {
  const final = probe?.finalUrl || url;
  const failed = !!probe && (!!probe.error || !probe.ok);

  // Host already has the custom domain set, so it bounces to the name this pr asks for
  if (!isOnService(url, service) && isOnService(final, service) && !isServiceHome(final, service)) return "cname";
  if (isServiceHome(url, service) || isServiceHome(final, service)) return "isadev";
  if (isOnService(url, service) && failed) return "isadev";
  if (isGithub(url) || isGithub(final)) return "github";
  if (vercelLocked(url, probe)) return "locked";
  if (failed) return "down";

  return "site";
}

export function siteInfoFrom(url: string, probe: Probe | null, service = "is-a.dev"): SiteInfo {
  return {
    status: probe && !probe.error ? probe.status : 0,
    finalUrl: probe?.finalUrl || url,
    kind: kindOf(url, probe, service),
    title: probe?.title ?? null,
  };
}
