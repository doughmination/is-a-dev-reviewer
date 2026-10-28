/* lib/core/github.ts
 * MIT Licence — (c) Clove Twilight
 */

import { BOT_LOGIN } from "./activity.ts";
import { agoPhrase } from "./time.ts";
import type {
  Check,
  ClosedReply,
  Comment,
  Label,
  Pages,
  PullRequest,
  Viewer,
} from "./types.ts";

const RAW = "application/vnd.github.raw+json";
const JSON_ACCEPT = "application/vnd.github+json";
const PAGE_SIZE = 40;

// Someone else acting this recently blocks the first try
const RECENT_WINDOW_MS = 30 * 60_000;
// Trying again within this window goes ahead anyway
const CONFIRM_WINDOW_MS = 2 * 60_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GithubOptions = {
  // Empty when a server proxy adds the token instead
  token?: string;
  repo: string;
  apiBase?: string;
  fetcher?: FetchLike;
};

export type ReviewComment = {
  path: string;
  line: number;
  start_line?: number;
  body: string;
};

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export class Github {
  readonly token: string;
  readonly repo: string;
  private apiBase: string;
  private fetcher: FetchLike;
  private loginPromise?: Promise<string>;
  private warnedAt = new Map<number, number>();

  constructor(options: GithubOptions) {
    this.token = options.token ?? "";
    this.repo = options.repo;
    this.apiBase = options.apiBase ?? "https://api.github.com";
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  }

  get owner() {
    return this.repo.split("/")[0];
  }

  get name() {
    return this.repo.split("/")[1];
  }

  async rest<T = any>(path: string, init: RequestInit = {}, accept = JSON_ACCEPT): Promise<T> {
    const headers = {
      ...this.authHeader(),
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    const response = await this.fetcher(`${this.apiBase}${path}`, { ...init, headers });

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) message = `${response.status}: ${body.message}`;
      } catch {}
      throw new Error(message);
    }

    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get("content-type") || "";
    const wantsJson = contentType.includes("json") && !accept.includes("raw");
    return (wantsJson ? response.json() : response.text()) as Promise<T>;
  }

  async graphql<T = any>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await this.fetcher(`${this.apiBase}/graphql`, {
      method: "POST",
      headers: {
        ...this.authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as { data?: any; errors?: { message: string }[]; message?: string };

    if (body.errors?.length) throw new Error(body.errors[0].message);
    if (!response.ok) throw new Error(body.message || response.statusText);

    return body.data;
  }

  private authHeader(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private myLogin() {
    this.loginPromise ??= this.rest("/user").then((user) => user.login);
    return this.loginPromise;
  }

  async viewer(): Promise<Viewer> {
    const user = await this.rest("/user");
    return {
      login: user.login,
      name: user.name || user.login,
      avatar: user.avatar_url,
      url: user.html_url,
    };
  }

  async listPulls(extraQuery: string, after: string | null) {
    const query = `repo:${this.repo} is:pr is:open sort:created-asc ${extraQuery}`.trim();
    const data = await this.graphql(LIST_QUERY, { q: query, after });
    const pulls: PullRequest[] = data.search.nodes
      .filter((node: any) => node?.number)
      .map(mapPull);

    return {
      total: data.search.issueCount as number,
      next: data.search.pageInfo.hasNextPage ? (data.search.pageInfo.endCursor as string) : null,
      pulls,
    };
  }

  async getPull(number: number): Promise<PullRequest> {
    const data = await this.graphql(ONE_QUERY, {
      owner: this.owner,
      name: this.name,
      number,
    });
    return mapPull(data.repository.pullRequest);
  }

  labels(): Promise<Label[]> {
    return this.rest(`/repos/${this.repo}/labels?per_page=100`);
  }

  comments(number: number): Promise<Comment[]> {
    return this.rest(`/repos/${this.repo}/issues/${number}/comments?per_page=100`);
  }

  fileAt(path: string, ref: string): Promise<string> {
    return this.rest(`/repos/${this.repo}/contents/${encodePath(path)}?ref=${ref}`, {}, RAW);
  }

  // The file on the default branch right now, null when it doesn't exist there
  async fileOnMain(path: string): Promise<string | null> {
    try {
      return await this.rest(`/repos/${this.repo}/contents/${encodePath(path)}`, {}, RAW);
    } catch (error: any) {
      if (String(error.message).startsWith("404")) return null;
      throw error;
    }
  }

  filePatches(number: number): Promise<{ filename: string; patch?: string; status: string; previous_filename?: string }[]> {
    return this.rest(`/repos/${this.repo}/pulls/${number}/files?per_page=50`);
  }

  async count(query: string): Promise<number> {
    const result = await this.rest(`/search/issues?per_page=1&q=${encodeURIComponent(query)}`);
    return result.total_count ?? 0;
  }

  addLabels(number: number, labels: string[]) {
    return this.rest(`/repos/${this.repo}/issues/${number}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels }),
    });
  }

  removeLabel(number: number, label: string) {
    return this.rest(`/repos/${this.repo}/issues/${number}/labels/${encodeURIComponent(label)}`, {
      method: "DELETE",
    });
  }

  // Refuses to post a reply I already left word for word
  async comment(number: number, body: string) {
    const [me, previous] = await Promise.all([this.myLogin(), this.comments(number)]);
    const duplicate = previous.find((item) => item.user?.login === me && normalize(item.body ?? "") === normalize(body));

    if (duplicate) {
      throw new Error(`already posted this exact reply on #${number} (${agoPhrase(duplicate.created_at)}), nothing sent`);
    }

    return this.rest(`/repos/${this.repo}/issues/${number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  close(number: number) {
    return this.setState(number, "closed");
  }

  reopen(number: number) {
    return this.setState(number, "open");
  }

  private setState(number: number, state: "open" | "closed") {
    return this.rest(`/repos/${this.repo}/pulls/${number}`, {
      method: "PATCH",
      body: JSON.stringify({ state }),
    });
  }

  approve(number: number, body = ""): Promise<{ id: number }> {
    return this.rest(`/repos/${this.repo}/pulls/${number}/reviews`, {
      method: "POST",
      body: JSON.stringify({ event: "APPROVE", ...(body ? { body } : {}) }),
    });
  }

  dismissReview(number: number, reviewId: number, message: string) {
    return this.rest(`/repos/${this.repo}/pulls/${number}/reviews/${reviewId}/dismissals`, {
      method: "PUT",
      body: JSON.stringify({ message, event: "DISMISS" }),
    });
  }

  // One last look before acting: the queue can be minutes old and other maintainers work it too
  async preflight(number: number, options: { sha?: string; body?: string; merging?: boolean } = {}) {
    const [me, pull, comments, reviews, events] = await Promise.all([
      this.myLogin(),
      this.rest<any>(`/repos/${this.repo}/pulls/${number}`),
      this.comments(number),
      this.rest<any[]>(`/repos/${this.repo}/pulls/${number}/reviews?per_page=100`),
      this.rest<any[]>(`/repos/${this.repo}/issues/${number}/events?per_page=100`).catch(() => []),
    ]);

    if (pull.merged) throw new Error(`already merged${pull.merged_by?.login ? ` by ${pull.merged_by.login}` : ""}, nothing done`);
    if (pull.state === "closed") throw new Error("already closed, nothing done");
    if (options.sha && pull.head?.sha !== options.sha) throw new Error("new commits were pushed since it loaded, take another look");

    const conflicted = pull.mergeable === false || pull.mergeable_state === "dirty";
    if (options.merging && conflicted) throw new Error("has merge conflicts, nothing done");

    if (options.body) {
      const wanted = normalize(options.body);
      const duplicate = [...comments, ...reviews].find((item: any) => item.body && normalize(item.body) === wanted);
      if (duplicate) {
        const who = duplicate.user?.login === me ? "I" : duplicate.user?.login;
        throw new Error(`${who} already posted this exact reply, nothing sent`);
      }
    }

    const recent = recentHumanAction(me, pull.user?.login, comments, reviews, events);
    const lastWarned = this.warnedAt.get(number) ?? 0;

    if (recent && Date.now() - lastWarned > CONFIRM_WINDOW_MS) {
      this.warnedAt.set(number, Date.now());
      throw new Error(`${recent.who} ${recent.what} ${agoPhrase(recent.at)}, have a look first (do it again to go ahead anyway)`);
    }

    return pull;
  }

  // "Changes requested" with ```suggestion comments; github 422s on lines outside the diff
  async requestChanges(number: number, body: string, sha: string, comments: ReviewComment[]) {
    const [me, previous] = await Promise.all([
      this.myLogin(),
      this.rest<any[]>(`/repos/${this.repo}/pulls/${number}/reviews?per_page=100`),
    ]);

    const alreadySent = previous.some((review) => review.user?.login === me && normalize(review.body ?? "") === normalize(body));
    if (alreadySent) throw new Error(`already requested these exact changes on #${number}, nothing sent`);

    const post = (inline: ReviewComment[]) =>
      this.rest(`/repos/${this.repo}/pulls/${number}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          event: "REQUEST_CHANGES",
          body,
          commit_id: sha,
          comments: inline.map(toReviewComment),
        }),
      });

    try {
      return await post(comments);
    } catch (error: any) {
      if (!comments.length || !String(error.message).startsWith("422")) throw error;
      return post([]);
    }
  }

  // Never leave an approval behind on a pr that didn't merge
  async approveAndMerge(number: number, sha: string, shouldApprove: boolean) {
    await this.preflight(number, { sha, merging: true });
    const review = shouldApprove ? await this.approve(number) : null;

    try {
      await this.merge(number, sha);
    } catch (error: any) {
      if (review) {
        await this.dismissReview(number, review.id, "merge didn't go through, taking the approval back for now").catch(() => {});
      }
      throw new Error(`merge failed (${error.message})${review ? ", approval taken back" : ""}`);
    }
  }

  merge(number: number, sha: string) {
    return this.rest(`/repos/${this.repo}/pulls/${number}/merge`, {
      method: "PUT",
      body: JSON.stringify({ merge_method: "merge", sha }),
    });
  }

  async pendingRuns(sha: string): Promise<{ id: number; name: string }[]> {
    const data = await this.rest(`/repos/${this.repo}/actions/runs?head_sha=${sha}&status=action_required&per_page=20`);
    return data.workflow_runs.map((run: any) => ({ id: run.id, name: run.name }));
  }

  approveRun(runId: number) {
    return this.rest(`/repos/${this.repo}/actions/runs/${runId}/approve`, { method: "POST" });
  }

  // Raw file from any repo (docs, terms, trusted users...)
  raw(repo: string, path: string, ref = "main"): Promise<string> {
    return this.rest(`/repos/${repo}/contents/${path}?ref=${ref}`, {}, RAW);
  }

  async trusted(): Promise<{ id: number; username?: string }[]> {
    try {
      return JSON.parse(await this.raw(this.repo, "util/trusted.json"));
    } catch {
      return [];
    }
  }

  user(login: string) {
    return this.rest(`/users/${encodeURIComponent(login)}`);
  }

  userRepos(login: string) {
    return this.rest(`/users/${encodeURIComponent(login)}/repos?sort=pushed&per_page=8`);
  }

  repoInfo(fullName: string) {
    return this.rest(`/repos/${fullName}`);
  }

  readme(fullName: string): Promise<string> {
    return this.rest(`/repos/${fullName}/readme`, {}, RAW);
  }

  // Prs I closed where the author wrote back after and I haven't answered (they can't reopen)
  async closedReplies(me: string, days = 14): Promise<ClosedReply[]> {
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const query = `repo:${this.repo} is:pr is:closed is:unmerged involves:${me} updated:>=${since}`;
    const data = await this.graphql(CLOSED_QUERY, { q: query });
    const replies: ClosedReply[] = [];

    for (const node of data.search.nodes ?? []) {
      const closedByMe = (node?.timelineItems?.nodes ?? []).some((event: any) => event?.actor?.login === me);
      if (!node?.closedAt || !closedByMe) continue;

      const afterClose = (node.comments?.nodes ?? []).filter((item: any) => item.createdAt > node.closedAt);
      const last = afterClose[afterClose.length - 1];
      if (!last || last.author?.login !== node.author?.login) continue;

      replies.push({
        number: node.number,
        title: node.title,
        url: node.url,
        author: node.author?.login ?? "",
        avatar: node.author?.avatarUrl ?? "",
        at: last.createdAt,
        text: String(last.bodyText ?? "").slice(0, 140),
      });
    }

    return replies.sort((first, second) => second.at.localeCompare(first.at));
  }

  // GitHub Pages setup behind a *.github.io link: repo, custom domain, build source
  async pagesFor(url: string): Promise<Pages | null> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    const match = parsed.host.toLowerCase().match(/^([a-z0-9-]+)\.github\.io$/);
    if (!match) return null;

    const owner = match[1];
    const userSite = `${owner}.github.io`;
    const firstSegment = parsed.pathname.split("/").filter(Boolean)[0];
    const candidates = firstSegment ? [firstSegment, userSite] : [userSite];

    for (const repo of candidates) {
      const pages = await this.rest<any>(`/repos/${owner}/${repo}/pages`).catch(() => null);
      if (!pages) continue;

      const info = await this.rest<any>(`/repos/${owner}/${repo}`).catch(() => null);
      return {
        owner: info?.owner?.login ?? owner,
        repo: info?.name ?? repo,
        cname: pages.cname ?? null,
        buildType: pages.build_type === "workflow" ? "workflow" : "legacy",
        branch: pages.source?.branch ?? info?.default_branch ?? "main",
        path: (pages.source?.path ?? "/").replace(/^\/+|\/+$/g, ""),
        project: repo !== userSite && repo === firstSegment,
      };
    }

    return null;
  }
}

function toReviewComment({ start_line, ...comment }: ReviewComment) {
  return {
    ...comment,
    side: "RIGHT",
    ...(start_line ? { start_line, start_side: "RIGHT" } : {}),
  };
}

type RecentAction = {
  who: string;
  what: string;
  at: string;
};

function recentHumanAction(
  me: string,
  author: string | undefined,
  comments: any[],
  reviews: any[],
  events: any[],
): RecentAction | undefined {
  const isOtherHuman = (user: any) =>
    user?.login
    && user.login !== me
    && user.login !== author
    && user.type !== "Bot"
    && !BOT_LOGIN.test(user.login);

  const fromComments = comments
    .filter((item) => isOtherHuman(item.user))
    .map((item) => ({ who: item.user.login, what: "commented", at: item.created_at }));

  const fromReviews = reviews
    .filter((review) => isOtherHuman(review.user) && review.submitted_at)
    .map((review) => ({
      who: review.user.login,
      what: review.state === "APPROVED" ? "approved" : "reviewed",
      at: review.submitted_at,
    }));

  const fromEvents = events
    .filter((event) => isOtherHuman(event.actor) && /^(labeled|unlabeled|assigned)$/.test(event.event))
    .map((event) => ({
      who: event.actor.login,
      what: event.event === "assigned" ? "assigned it" : `${event.event} it`,
      at: event.created_at,
    }));

  const cutoff = Date.now() - RECENT_WINDOW_MS;

  return [...fromComments, ...fromReviews, ...fromEvents]
    .filter((action) => Date.parse(action.at) > cutoff)
    .sort((first, second) => second.at.localeCompare(first.at))[0];
}

const PULL_FIELDS = `
  id number title url createdAt isDraft body mergeable reviewDecision changedFiles
  author { login avatarUrl url ... on User { databaseId } }
  labels(first: 30) { nodes { name color description } }
  comments(last: 6) { totalCount nodes { author { login __typename } createdAt } }
  reviews(last: 4) { nodes { author { login __typename } submittedAt } }
  files(first: 20) { nodes { path additions deletions changeType } }
  timelineItems(itemTypes: [LABELED_EVENT, HEAD_REF_FORCE_PUSHED_EVENT], last: 12) { nodes {
    __typename
    ... on LabeledEvent { createdAt label { name } }
    ... on HeadRefForcePushedEvent { createdAt }
  } }
  commits(last: 1) { nodes { commit { oid committedDate statusCheckRollup { state contexts(first: 40) { nodes {
    __typename
    ... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } }
    ... on StatusContext { context state targetUrl }
  } } } } } }
`;

const LIST_QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: ${PAGE_SIZE}, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { ${PULL_FIELDS} } }
  }
}`;

const ONE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { ${PULL_FIELDS} } }
}`;

const CLOSED_QUERY = `query($q: String!) { search(query: $q, type: ISSUE, first: 100) { nodes { ... on PullRequest {
  number title url closedAt author { login avatarUrl }
  comments(last: 8) { nodes { author { login } createdAt bodyText } }
  timelineItems(itemTypes: [CLOSED_EVENT], last: 4) { nodes { ... on ClosedEvent { actor { login } } } }
} } } }`;

function mapCheck(context: any): Check {
  if (context.__typename === "CheckRun") {
    return {
      name: context.name,
      workflow: context.checkSuite?.workflowRun?.workflow?.name,
      status: context.status,
      conclusion: context.conclusion,
      url: context.detailsUrl,
    };
  }

  const pending = context.state === "PENDING";
  return {
    name: context.context,
    status: pending ? "PENDING" : "COMPLETED",
    conclusion: pending ? null : context.state,
    url: context.targetUrl,
  };
}

const latest = (...times: string[]) =>
  times.reduce((newest, candidate) => (Date.parse(candidate) > Date.parse(newest) ? candidate : newest));

export function mapPull(node: any): PullRequest {
  const commit = node.commits?.nodes?.[0]?.commit;
  const contexts: any[] = commit?.statusCheckRollup?.contexts?.nodes ?? [];
  const timeline: any[] = node.timelineItems?.nodes ?? [];

  // Same workflow can run more than once (synchronize, reruns), keep the newest per name
  const checksByName = new Map<string, Check>();
  for (const context of contexts) {
    const check = mapCheck(context);
    checksByName.set(`${check.workflow ?? ""}/${check.name}`, check);
  }

  const commentActivity = (node.comments?.nodes ?? []).map((item: any) => ({
    login: item.author?.login ?? "",
    at: item.createdAt,
    bot: item.author?.__typename === "Bot",
  }));
  const reviewActivity = (node.reviews?.nodes ?? []).map((review: any) => ({
    login: review.author?.login ?? "",
    at: review.submittedAt,
    bot: review.author?.__typename === "Bot",
  }));

  const forcePushes = timeline
    .filter((item) => item.__typename === "HeadRefForcePushedEvent")
    .map((item) => item.createdAt);
  const labeledAt = Object.fromEntries(
    timeline
      .filter((item) => item.label)
      .map((item) => [item.label.name, item.createdAt]),
  );

  return {
    id: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    createdAt: node.createdAt,
    isDraft: node.isDraft,
    body: node.body ?? "",
    mergeable: node.mergeable,
    reviewDecision: node.reviewDecision,
    author: node.author,
    labels: node.labels?.nodes ?? [],
    headOid: commit?.oid ?? "",
    files: node.files?.nodes ?? [],
    changedFiles: node.changedFiles,
    comments: node.comments?.totalCount ?? 0,
    checkState: commit?.statusCheckRollup?.state ?? null,
    checks: [...checksByName.values()],
    activity: [...commentActivity, ...reviewActivity].filter((event) => event.at),
    pushedAt: latest(commit?.committedDate ?? node.createdAt, ...forcePushes),
    labeledAt,
  };
}
