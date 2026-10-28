/* lib/core/replies.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { Failure } from "./checks.ts";
import { explain, type Explained } from "./fixes.ts";
import { vercelDeploy, type SiteInfo } from "./site.ts";
import type { PullRequest } from "./types.ts";
import type { FileInfo } from "./verdict.ts";

export type ReplyContext = {
  pull: PullRequest;
  preview: string | null;
  files: FileInfo[];
  site: SiteInfo | null;
  failures: Failure[];
  queue: PullRequest[];
  service: string;
};

export function explainFailures(context: ReplyContext): Explained {
  const fixFiles = context.files.map((file) => ({
    path: file.path,
    changeType: file.changeType ?? "MODIFIED",
    content: file.content,
    before: file.before,
    ownerGone: file.ownerGone,
  }));

  return explain(context.failures, fixFiles, context.pull.author?.login ?? "", context.pull.body);
}

// Values for the {placeholders} in canned replies
export function replyVars(context: ReplyContext, fixes: Explained): Record<string, string> {
  const { pull, preview, site } = context;
  const domainFile = context.files.find((file) => file.name);
  const production = preview ? vercelDeploy(preview) : null;
  const suggestionCount = fixes.suggestions.length;

  const sameAuthor = context.queue
    .filter((other) => other.number !== pull.number && other.author?.login === pull.author?.login)
    .map((other) => `#${other.number}`);

  const suggestedText = suggestionCount
    ? `I left ${suggestionCount === 1 ? "a suggestion" : "suggestions"} on the exact lines too, you can hit **Commit suggestion** in the Files changed tab.\n\n`
    : "";

  return {
    author: pull.author?.login ?? "",
    service: context.service,
    domain: domainFile?.name ? `${domainFile.name}.${context.service}` : "your subdomain",
    preview: preview ?? "",
    number: String(pull.number),
    status: site?.status ? String(site.status) : "no response",
    final: site?.finalUrl ?? preview ?? "",
    prod: production ? ` (probably \`${production}\`)` : "",
    failing: fixes.text,
    suggested: suggestedText,
    dup: sameAuthor.join(", "),
  };
}
