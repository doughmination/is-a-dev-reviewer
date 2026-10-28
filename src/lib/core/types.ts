/* lib/core/types.ts
 * MIT Licence — (c) Clove Twilight
 */

export type Label = {
  name: string;
  color: string;
  description?: string;
};

export type Check = {
  name: string;
  workflow?: string;
  // COMPLETED, IN_PROGRESS, QUEUED, PENDING...
  status: string;
  // SUCCESS, FAILURE, NEUTRAL, SKIPPED, ACTION_REQUIRED...
  conclusion: string | null;
  url?: string;
};

export type Viewer = {
  login: string;
  name: string;
  avatar: string;
  url: string;
};

export type PullFile = {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
};

export type Activity = {
  login: string;
  at: string;
  bot: boolean;
};

export type PullAuthor = {
  login: string;
  avatarUrl: string;
  url: string;
  databaseId?: number;
};

export type PullRequest = {
  id: string;
  number: number;
  title: string;
  url: string;
  createdAt: string;
  isDraft: boolean;
  body: string;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  reviewDecision: string | null;
  author: PullAuthor | null;
  labels: Label[];
  headOid: string;
  files: PullFile[];
  changedFiles: number;
  comments: number;
  checkState: string | null;
  checks: Check[];
  // Newest comments and reviews, for skipping prs someone already handled
  activity: Activity[];
  pushedAt: string;
  // When each label was last put on
  labeledAt: Record<string, string>;
};

export type Comment = {
  id: number;
  user: {
    login: string;
    avatar_url: string;
  };
  body: string;
  created_at: string;
  author_association: string;
};

export type ClosedReply = {
  number: number;
  title: string;
  url: string;
  author: string;
  avatar: string;
  at: string;
  text: string;
};

export type Pages = {
  owner: string;
  repo: string;
  cname: string | null;
  buildType: "legacy" | "workflow";
  branch: string;
  path: string;
  project: boolean;
};

// What the bun side reports after loading a site
export type Probe = {
  ok: boolean;
  status: number;
  finalUrl: string;
  frameable: boolean;
  title: string | null;
  error: string | null;
};

export type MusicItem = {
  name: string;
  title: string;
  url: string;
  size: number;
  addedAt: number;
};
