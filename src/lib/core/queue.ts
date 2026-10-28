/* lib/core/queue.ts
 * MIT Licence — (c) Clove Twilight
 */

import { isNotDomainPull, lowPriorityHoursLeft, reviewedBy, waitingOnAuthor } from "./activity.ts";
import type { PullRequest } from "./types.ts";

export type QueueRules = {
  skipLabels: string[];
  skipReviewed: boolean;
  hideCi: boolean;
};

// Why a pr is left out of the queue, or null when it should show
export function hiddenReason(pull: PullRequest, rules: QueueRules, now = Date.now()): string | null {
  if (pull.isDraft) return "draft";

  const skipped = pull.labels.find((label) => rules.skipLabels.includes(label.name));
  if (skipped) return `labeled ${skipped.name}`;

  if (rules.hideCi && (isNotDomainPull(pull) || pull.labels.some((label) => label.name === "ci"))) {
    return "not a domain pr";
  }

  if (rules.skipReviewed) {
    const reviewer = reviewedBy(pull);
    if (reviewer) return `${reviewer.login} already replied`;
  }

  const waiting = waitingOnAuthor(pull);
  if (waiting) return `waiting on author (${waiting.label})`;

  const hoursLeft = lowPriorityHoursLeft(pull, now);
  if (hoursLeft) return `low priority, back in ${hoursLeft}h`;

  return null;
}

export function splitQueue(pulls: PullRequest[], rules: QueueRules) {
  const visible: PullRequest[] = [];
  const hidden: { pull: PullRequest; reason: string }[] = [];

  for (const pull of pulls) {
    const reason = hiddenReason(pull, rules);
    if (reason) hidden.push({ pull, reason });
    else visible.push(pull);
  }

  return { visible, hidden };
}
