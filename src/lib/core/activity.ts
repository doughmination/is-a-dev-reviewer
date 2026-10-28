/* lib/core/activity.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { PullRequest } from "./types.ts";

// GraphQL gives bot logins without the [bot] suffix, so match on the name too
export const BOT_LOGIN = /\[bot\]$|bot$|^is-a-dev-bot$|^copilot|^github-actions$/i;

// Labels that mean the ball is in the author's court
export const WAITING_LABELS = [
  "status: awaiting user response",
  "status: needs preview",
];

const LOW_PRIORITY_LABEL = "status: low priority";
const LOW_PRIORITY_HOURS = 48;
const HOUR_MS = 3600_000;

const time = (iso: string | undefined) => Date.parse(iso ?? "") || 0;

function isReviewer(login: string, isBot: boolean, author: string | undefined) {
  return !!login
    && login !== author
    && !isBot
    && !BOT_LOGIN.test(login);
}

// Last human (not author, not bot) who spoke after the author's last comment or push
export function reviewedBy(pull: PullRequest) {
  const author = pull.author?.login;
  let authorLast = Math.max(time(pull.pushedAt), time(pull.createdAt));
  let reviewer: { login: string; at: string } | null = null;

  for (const event of pull.activity) {
    const at = time(event.at);

    if (event.login === author) {
      authorLast = Math.max(authorLast, at);
    } else if (isReviewer(event.login, event.bot, author)) {
      if (!reviewer || at > time(reviewer.at)) reviewer = event;
    }
  }

  return reviewer && time(reviewer.at) > authorLast ? reviewer : null;
}

// A reviewer spoke, then the author came back with a comment or a push
export function authorReplied(pull: PullRequest) {
  const author = pull.author?.login;
  let reviewerLast = 0;
  let authorLast = 0;

  for (const event of pull.activity) {
    const at = time(event.at);

    if (event.login === author) authorLast = Math.max(authorLast, at);
    else if (isReviewer(event.login, event.bot, author)) reviewerLast = Math.max(reviewerLast, at);
  }

  if (!reviewerLast) return null;

  const pushed = time(pull.pushedAt);

  if (authorLast > reviewerLast && authorLast >= pushed) {
    return {
      how: "commented" as const,
      at: new Date(authorLast).toISOString(),
    };
  }

  if (pushed > reviewerLast) {
    return {
      how: "pushed" as const,
      at: pull.pushedAt,
    };
  }

  return null;
}

// A waiting label the author hasn't answered (no comment or push since it went on)
export function waitingOnAuthor(pull: PullRequest) {
  const label = pull.labels.find((item) => WAITING_LABELS.includes(item.name));
  if (!label) return null;

  const labeledAt = pull.labeledAt[label.name];
  // No timestamp: labeled long ago, any author activity after creation counts as an answer
  const since = time(labeledAt);
  const author = pull.author?.login;

  const authorTimes = pull.activity
    .filter((event) => event.login === author)
    .map((event) => time(event.at));
  const authorLast = Math.max(time(pull.pushedAt), ...authorTimes);

  const answeredSinceLabel = since && authorLast > since;
  const answeredWithoutTimestamp = !since && authorLast > time(pull.createdAt) + 60_000;

  if (answeredSinceLabel || answeredWithoutTimestamp) return null;

  return {
    label: label.name,
    at: labeledAt ?? "",
  };
}

// Low priority prs sit out for 2 days after labeling, returns hours left
export function lowPriorityHoursLeft(pull: PullRequest, now = Date.now()) {
  if (!pull.labels.some((item) => item.name === LOW_PRIORITY_LABEL)) return null;

  const labeledAt = time(pull.labeledAt[LOW_PRIORITY_LABEL]);
  if (!labeledAt) return null;

  const left = labeledAt + LOW_PRIORITY_HOURS * HOUR_MS - now;
  return left > 0 ? Math.ceil(left / HOUR_MS) : null;
}

// CI / workflow / docs prs: nothing under domains/
export function isNotDomainPull(pull: PullRequest) {
  return pull.files.length > 0
    && !pull.files.some((file) => file.path.startsWith("domains/"));
}
