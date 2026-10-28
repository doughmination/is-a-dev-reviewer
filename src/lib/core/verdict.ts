/* lib/core/verdict.ts
 * MIT Licence — (c) Clove Twilight
 */

import { checkKind, rollupKind, type Failure } from "./checks.ts";
import { vercelDeploy, type SiteInfo } from "./site.ts";
import type { BoxState, Hint } from "./template.ts";
import type { PullRequest } from "./types.ts";

export type FileInfo = {
  path: string;
  changeType?: string;
  name?: string;
  json?: any;
  // Raw text at the pr head, for building fixes
  content?: string;
  hints?: Hint[];
  error?: string;
  before?: any;
  ownerGone?: boolean;
};

export type IssueLevel = "bad" | "warn" | "info" | "ok";

export type Issue = {
  id: string;
  level: IssueLevel;
  icon: string;
  title: string;
  detail?: string;
  // Canned reply id
  reply?: string;
  labels?: string[];
  action?: "approveCI" | { select: number };
};

export type Tone = "go" | "fix" | "close" | "wait" | "judge" | "load";

export type Verdict = {
  tone: Tone;
  icon: string;
  headline: string;
  issues: Issue[];
  canMerge: boolean;
};

export type VerdictInput = {
  pull: PullRequest;
  boxes: BoxState[];
  hasTemplate: boolean;
  preview: string | null;
  files: FileInfo[] | null;
  site: SiteInfo | null;
  probing: boolean;
  pendingRuns: number;
  failures: Failure[];
  reason: string | null;
  queue: PullRequest[];
  trusted: Set<number>;
  // The domain being handed out: is-a.dev or is-a.bot
  service?: string;
};

// These get closed straight away; they can fix it and reopen
const CLOSING_ISSUES = new Set(["ai", "tpl", "down404", "isadev", "locked"]);

const LEVEL_ORDER: Record<IssueLevel, number> = {
  bad: 0,
  warn: 1,
  info: 2,
  ok: 3,
};

export const bypassesTemplate = (labels: string[]) =>
  labels.includes("ci: bypass-template-check") || labels.includes("maintainer");

export const bypassesOwner = (labels: string[]) => labels.includes("ci: bypass-owner-check");

const domainName = (path: string) => path.replace(/^domains\//, "").replace(/\.json$/, "");
const serviceOf = (input: VerdictInput) => input.service ?? "is-a.dev";

function duplicateIssues(input: VerdictInput): Issue[] {
  const { pull, queue } = input;
  const others = queue.filter((other) => other.number !== pull.number && other.author?.login === pull.author?.login);

  return others.map((other) => ({
    id: `dup${other.number}`,
    level: "warn",
    icon: "content_copy",
    title: `Same author has #${other.number} open`,
    detail: other.title,
    reply: other.number < pull.number ? "duplicate" : undefined,
    action: { select: other.number },
  }));
}

function templateIssues(input: VerdictInput, labels: string[], trustedAuthor: boolean): Issue[] {
  const unticked = input.boxes.filter((box) => box.state !== "checked");

  if (bypassesTemplate(labels) || trustedAuthor) {
    if (!unticked.length) return [];
    return [{
      id: "tpl-bypass",
      level: "info",
      icon: "verified_user",
      title: "Template check bypassed",
      detail: trustedAuthor ? "trusted author" : "bypass label set",
    }];
  }

  if (!input.hasTemplate) {
    return [{
      id: "tpl",
      level: "bad",
      icon: "checklist",
      title: "PR template removed",
      reply: "checkboxes",
    }];
  }

  if (!unticked.length) return [];

  const plural = unticked.length > 1 ? "s" : "";
  return [{
    id: "tpl",
    level: "bad",
    icon: "checklist",
    title: `${unticked.length} requirement${plural} not ticked`,
    detail: unticked.map((box) => box.label).join(", "),
    reply: "checkboxes",
  }];
}

function fileIssues(files: FileInfo[] | null, domainFiles: FileInfo[]): Issue[] {
  const issues: Issue[] = [];
  const records = domainFiles.flatMap((file) => Object.keys(file.json?.records ?? {}));

  if (records.includes("NS")) {
    issues.push({
      id: "ns",
      level: "warn",
      icon: "hub",
      title: "NS records",
      detail: "Service owner decides. Needs a real reason in the description, no self hosting, 30+ day old user.",
    });
  }

  const outsideDomains = files?.some((file) => !file.path.startsWith("domains/") && file.path.endsWith(".json"));
  if (outsideDomains) {
    issues.push({
      id: "root",
      level: "bad",
      icon: "folder_off",
      title: "JSON file outside domains/",
      reply: "tests",
    });
  }

  for (const file of files ?? []) {
    const invalid = file.error || file.hints?.some((hint) => hint.ok === false && hint.text.startsWith("invalid JSON"));
    if (!invalid) continue;

    issues.push({
      id: `json${file.path}`,
      level: "bad",
      icon: "data_object",
      title: `${file.path} isn't valid JSON`,
      reply: "tests",
    });
  }

  return issues;
}

function ownerIssues(domainFiles: FileInfo[], author: string, ownerBypassed: boolean): Issue[] {
  const wrongOwner = domainFiles.filter((file) => file.json?.owner?.username && file.json.owner.username.toLowerCase() !== author);
  if (!wrongOwner.length) return [];

  const ownerName = wrongOwner[0].json.owner.username;

  if (ownerBypassed) {
    return [{
      id: "owner-bypass",
      level: "info",
      icon: "verified_user",
      title: "Owner check bypassed",
      detail: `owner @${ownerName}`,
    }];
  }

  const allNew = wrongOwner.every((file) => file.changeType === "ADDED");
  return [{
    id: "owner",
    level: "bad",
    icon: "badge",
    title: `Owner is @${ownerName}, not the author`,
    detail: allNew ? "new file, owner.username just has to be their own username" : undefined,
    reply: allNew ? "wrong-owner" : "unauthorized",
  }];
}

// Edits to a domain that's already registered: whose it is and what changes
function updateIssues(files: FileInfo[] | null, author: string, ownerBypassed: boolean, service: string): Issue[] {
  const issues: Issue[] = [];

  for (const file of files ?? []) {
    if (!file.before) continue;

    const name = domainName(file.path);
    const previousOwner = file.before.owner?.username ?? "?";
    const isTheirs = !file.before.owner?.username || String(previousOwner).toLowerCase() === author;

    if (file.changeType === "DELETED") {
      issues.push({
        id: `rm${file.path}`,
        level: isTheirs ? "info" : "bad",
        icon: "delete",
        title: `Removes ${name}.${service}`,
        detail: `registered to @${previousOwner}`,
        reply: isTheirs ? undefined : "unauthorized",
      });
      continue;
    }

    if (isTheirs || ownerBypassed) {
      const changes = describeChange(file.before, file.json ?? {});
      issues.push({
        id: `upd${file.path}`,
        level: "info",
        icon: "edit_note",
        title: `Update to ${name}.${service}, already theirs`,
        detail: changes.length ? changes.join(" · ") : "no record changes",
      });
    } else if (file.ownerGone) {
      issues.push({
        id: `steal${file.path}`,
        level: "warn",
        icon: "badge",
        title: `Edits @${previousOwner}'s domain, that account is gone`,
        detail: "Probably a renamed account, check their profile / old repos before trusting it",
        reply: "renamed",
      });
    } else {
      issues.push({
        id: `steal${file.path}`,
        level: "bad",
        icon: "gpp_bad",
        title: `Edits @${previousOwner}'s domain`,
        detail: `${name}.${service} already belongs to them`,
        reply: "unauthorized",
      });
    }
  }

  return issues;
}

function siteIssues(input: VerdictInput, onlyMail: boolean): Issue[] {
  const { preview, site } = input;

  if (!preview) {
    if (onlyMail) {
      return [{
        id: "mail",
        level: "info",
        icon: "mail",
        title: "No website records",
        detail: "Email / verification only, no preview needed",
      }];
    }
    return [{
      id: "nopreview",
      level: "bad",
      icon: "link_off",
      title: "No preview link",
      reply: "needs-preview",
    }];
  }

  switch (site?.kind) {
    case "isadev":
      return [{
        id: "isadev",
        level: "bad",
        icon: "u_turn_left",
        title: `Preview goes to ${serviceOf(input)}`,
        detail: site.finalUrl,
        reply: "isadev-preview",
      }];

    case "cname": {
      const pages = site.pages;
      const target = site.finalUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

      if (site.sourceUrl && pages) {
        const where = `${pages.owner}/${pages.repo} on ${pages.branch}${pages.path ? "/" + pages.path : ""}`;
        return [{
          id: "cname-src",
          level: "info",
          icon: "folder_code",
          title: `Custom domain already set (${target})`,
          detail: `Showing it from ${where}, the repo source`,
        }];
      }

      return [{
        id: "cname",
        level: "bad",
        icon: "u_turn_left",
        title: `Preview redirects to ${target}`,
        detail: pages?.buildType === "workflow"
          ? "GitHub Pages builds with Actions, so the source can't be shown as is"
          : "The host has the custom domain set already, so the site can't be seen until merge",
        reply: "custom-domain",
      }];
    }

    case "locked": {
      const production = vercelDeploy(preview);
      if (production) {
        return [{
          id: "vercel-deploy",
          level: "bad",
          icon: "lock",
          title: "Vercel deployment link, needs a login",
          detail: `Production is probably ${production}`,
          reply: "vercel-deploy",
        }];
      }
      return [{
        id: "locked",
        level: "bad",
        icon: "lock",
        title: "Site is behind a Vercel login",
        detail: site.finalUrl,
        reply: "locked",
      }];
    }

    case "down": {
      const notFound = site.status === 404;
      const unreachable = site.status === 0;
      return [{
        id: notFound ? "down404" : "down",
        level: "bad",
        icon: "cloud_off",
        title: notFound ? "Website 404s" : unreachable ? "Website unreachable" : `Website errors (${site.status})`,
        detail: preview,
        reply: "unreachable",
      }];
    }

    case "github":
      return [{
        id: "github",
        level: "info",
        icon: "code",
        title: "Goes to GitHub",
        detail: "Valid, check the profile shows real dev work",
      }];

    default:
      return [];
  }
}

function checkIssues(input: VerdictInput, hasTemplateIssue: boolean): Issue[] {
  const { pull, pendingRuns, failures, reason } = input;
  const issues: Issue[] = [];

  if (pendingRuns) {
    issues.push({
      id: "ci",
      level: "warn",
      icon: "play_circle",
      title: `${pendingRuns} workflow${pendingRuns > 1 ? "s" : ""} waiting for approval`,
      action: "approveCI",
    });
  }

  const failed = pull.checks.filter((check) => checkKind(check) === "bad");
  const onlyTemplateFailed = failed.every((check) => check.name === "Template") && hasTemplateIssue;

  if (failed.length && !onlyTemplateFailed) {
    issues.push({
      id: "fail",
      level: "bad",
      icon: "bug_report",
      title: `${failed.map((check) => check.name).join(", ")} failing`,
      detail: failures.length ? failures.map((failure) => failure.test).join(" · ") : "reading the logs…",
      reply: "tests",
      labels: reason ? [reason] : undefined,
    });
  }

  if (pull.mergeable === "CONFLICTING") {
    issues.push({
      id: "conflict",
      level: "bad",
      icon: "call_split",
      title: "Merge conflict",
      labels: ["reason: merge conflict", "status: awaiting user response"],
    });
  }

  return issues;
}

function pickHeadline(input: VerdictInput, issues: Issue[]): Omit<Verdict, "issues" | "canMerge"> {
  const bad = issues.filter((issue) => issue.level === "bad");
  const checks = rollupKind(input.pull.checks, input.pull.checkState);
  const pending = checks === "wait" || input.pendingRuns > 0;
  const loading = !input.files || (!!input.preview && !input.site && input.probing);

  if (bad.some((issue) => CLOSING_ISSUES.has(issue.id))) {
    return { tone: "close", icon: "block", headline: "Close it" };
  }

  if (bad.length) {
    return {
      tone: "fix",
      icon: "build",
      headline: bad.length === 1 ? bad[0].title : `${bad.length} things to fix`,
    };
  }

  if (loading) return { tone: "load", icon: "hourglass_top", headline: "Checking…" };

  if (pending) {
    return {
      tone: "wait",
      icon: "schedule",
      headline: input.pendingRuns ? "Approve the checks first" : "Checks still running",
    };
  }

  if (issues.some((issue) => issue.id.startsWith("upd"))) {
    return { tone: "judge", icon: "edit_note", headline: "Owner updating their domain" };
  }

  return { tone: "judge", icon: "visibility", headline: "Looks clean, your call on the site" };
}

// Works out what this pr needs, most important first; human-only checks go to JUDGE_QUESTIONS
export function verdict(input: VerdictInput): Verdict {
  const { pull } = input;
  const labels = pull.labels.map((label) => label.name);
  const author = pull.author?.login?.toLowerCase() ?? "";
  const trustedAuthor = !!pull.author?.databaseId && input.trusted.has(pull.author.databaseId);
  const ownerBypassed = bypassesOwner(labels) || trustedAuthor;

  const domainFiles = (input.files ?? []).filter((file) => file.path.startsWith("domains/") && file.json);
  const records = domainFiles.flatMap((file) => Object.keys(file.json?.records ?? {}));
  const hasWebRecord = records.some((record) => ["A", "AAAA", "CNAME", "URL"].includes(record))
    || domainFiles.some((file) => file.json?.redirect_config);
  const onlyMail = domainFiles.length > 0 && !hasWebRecord;
  const nested = domainFiles.some((file) => file.name?.includes(".") && !file.name.startsWith("_"));

  const issues: Issue[] = [];

  if (/\(dns-preflight\)/i.test(pull.title)) {
    issues.push({
      id: "ai",
      level: "bad",
      icon: "smart_toy",
      title: "AI made PR",
      detail: "Title has (dns-preflight), the AGENTS.md marker",
      reply: "ai",
    });
  }

  issues.push(...duplicateIssues(input));

  const templateResult = templateIssues(input, labels, trustedAuthor);
  issues.push(...templateResult);
  issues.push(...fileIssues(input.files, domainFiles));
  issues.push(...ownerIssues(domainFiles, author, ownerBypassed));
  issues.push(...updateIssues(input.files, author, ownerBypassed, serviceOf(input)));

  if (nested) {
    issues.push({
      id: "nested",
      level: "info",
      icon: "account_tree",
      title: "Nested subdomain",
      detail: "Doesn't need to be dev related, parent must be theirs",
    });
  }

  issues.push(...siteIssues(input, onlyMail));

  // The preview should be what the records point at
  if (input.preview && input.site && input.site.kind !== "isadev") {
    const shownUrl = input.site.pages ? input.preview : input.site.finalUrl || input.preview;
    const mismatch = recordMismatch(shownUrl, domainFiles, serviceOf(input));
    if (mismatch) {
      issues.push({
        id: "mismatch",
        level: "warn",
        icon: "alt_route",
        title: "Preview isn't where the records point",
        detail: mismatch,
      });
    }
  }

  const hasTemplateIssue = templateResult.some((issue) => issue.id === "tpl");
  issues.push(...checkIssues(input, hasTemplateIssue));

  const bad = issues.filter((issue) => issue.level === "bad");
  const checks = rollupKind(pull.checks, pull.checkState);
  const canMerge = !bad.length && checks === "ok" && pull.mergeable !== "CONFLICTING";
  const sorted = [...issues].sort((first, second) => LEVEL_ORDER[first.level] - LEVEL_ORDER[second.level]);

  return {
    ...pickHeadline(input, issues),
    issues: sorted,
    canMerge,
  };
}

// Which hosting a hostname or ip belongs to
const HOSTING: [string, RegExp][] = [
  ["GitHub Pages", /(\.github\.io$|^185\.199\.(108|109|110|111)\.153$|^2606:50c0:)/],
  ["Vercel", /(\.vercel\.app$|vercel-dns|^76\.76\.21\.|^216\.198\.79\.|^66\.33\.60\.)/],
  ["Netlify", /(\.netlify\.app$|netlify\.com$|^75\.2\.60\.5$|^99\.83\.190\.102$)/],
  ["Cloudflare Pages", /\.pages\.dev$/],
  ["Render", /\.onrender\.com$/],
  ["Railway", /\.(up\.)?railway\.app$/],
  ["Firebase", /\.(web\.app|firebaseapp\.com)$/],
  ["GitLab Pages", /\.gitlab\.io$/],
  ["Codeberg", /\.codeberg\.page$/],
  ["Surge", /\.surge\.sh$/],
  ["Neocities", /\.neocities\.org$/],
];

function hostnameOf(value: string) {
  try {
    const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase();
  }
}

const hostingOf = (host: string) => HOSTING.find(([, pattern]) => pattern.test(host))?.[0] ?? null;
const githubUserOf = (host: string) => host.match(/^([a-z0-9-]+)\.github\.io$/)?.[1];

export function recordMismatch(preview: string, files: FileInfo[], service = "is-a.dev"): string | null {
  const previewHost = hostnameOf(preview);
  const onService = previewHost === service || previewHost.endsWith(`.${service}`);
  if (!previewHost || /(^|\.)github\.com$/.test(previewHost) || onService) return null;

  const targets: string[] = [];
  for (const file of files) {
    if (file.name?.startsWith("_")) continue;

    const records = file.json?.records ?? {};
    if (typeof records.CNAME === "string") targets.push(hostnameOf(records.CNAME.replace(/\.$/, "")));
    if (typeof records.URL === "string") targets.push(hostnameOf(records.URL));

    for (const type of ["A", "AAAA"]) {
      for (const address of ([] as unknown[]).concat(records[type] ?? [])) targets.push(String(address));
    }
  }

  if (!targets.length || targets.includes(previewHost)) return null;

  const previewHosting = hostingOf(previewHost);
  const targetHostings = [...new Set(targets.map(hostingOf))];

  // Same host either way is fine, but two different github users' pages is still a mismatch
  if (previewHosting && targetHostings.includes(previewHosting)) {
    const previewUser = githubUserOf(previewHost);
    const targetUser = targets.map(githubUserOf).find(Boolean);
    const differentUsers = previewUser && targetUser && previewUser !== targetUser;
    return differentUsers ? `Preview is ${previewHost}, the CNAME is ${targetUser}.github.io` : null;
  }

  // Two unknown hosts, could be the same server
  if (!previewHosting && targetHostings.every((hosting) => !hosting)) return null;

  const shown = targets.slice(0, 2).join(", ");
  const targetHosting = targetHostings[0] ? ` (${targetHostings[0]})` : "";
  return `Preview is on ${previewHosting ?? previewHost}, the records go to ${shown}${targetHosting}`;
}

const show = (value: unknown) =>
  Array.isArray(value) ? value.join(", ") : typeof value === "object" && value ? JSON.stringify(value) : String(value);

const truncate = (text: string) => (text.length > 46 ? `${text.slice(0, 44)}…` : text);

// "CNAME: a.github.io → b.vercel.app", "+TXT", "-A", "owner email"
export function describeChange(before: any, after: any): string[] {
  const changes: string[] = [];
  const oldRecords = before?.records ?? {};
  const newRecords = after?.records ?? {};

  for (const type of new Set([...Object.keys(oldRecords), ...Object.keys(newRecords)])) {
    if (!(type in oldRecords)) changes.push(`+${type} ${truncate(show(newRecords[type]))}`);
    else if (!(type in newRecords)) changes.push(`-${type}`);
    else if (show(oldRecords[type]) !== show(newRecords[type])) {
      changes.push(`${type}: ${truncate(show(oldRecords[type]))} → ${truncate(show(newRecords[type]))}`);
    }
  }

  for (const key of ["proxied", "redirect_config"]) {
    if (show(before?.[key]) !== show(after?.[key])) changes.push(`${key} changed`);
  }

  const oldOwner = before?.owner ?? {};
  const newOwner = after?.owner ?? {};
  const ownerKeys = [...new Set([...Object.keys(oldOwner), ...Object.keys(newOwner)])]
    .filter((key) => key !== "username" && show(oldOwner[key]) !== show(newOwner[key]));
  if (ownerKeys.length) changes.push(`owner ${ownerKeys.join(", ")}`);

  return changes;
}
