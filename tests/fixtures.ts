/* tests/fixtures.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { PullRequest } from "../src/lib/core/types";

export const TICKED_BODY = `
<!-- WEBSITE_PREVIEW_START -->
https://alice.github.io
<!-- WEBSITE_PREVIEW_END -->

- [x] <!-- TOS --> I agree
- [x] <!-- DOMAIN_STRUCTURE --> structure
- [x] <!-- WEBSITE_REACHABLE --> reachable
- [x] <!-- SOFTWARE_RELATED --> dev
- [x] <!-- NON_COMMERCIAL --> free
- [x] <!-- CONTACT_INFO --> contact
- [x] <!-- WEBSITE_LINK --> link
`;

export function makePull(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "PR_1",
    number: 100,
    title: "Register alice.is-a.dev",
    url: "https://github.com/is-a-dev/register/pull/100",
    createdAt: "2026-10-01T10:00:00Z",
    isDraft: false,
    body: TICKED_BODY,
    mergeable: "MERGEABLE",
    reviewDecision: null,
    author: {
      login: "alice",
      avatarUrl: "",
      url: "https://github.com/alice",
      databaseId: 1,
    },
    labels: [],
    headOid: "abc123",
    files: [
      {
        path: "domains/alice.json",
        additions: 10,
        deletions: 0,
        changeType: "ADDED",
      },
    ],
    changedFiles: 1,
    comments: 0,
    checkState: "SUCCESS",
    checks: [
      {
        name: "Tests",
        status: "COMPLETED",
        conclusion: "SUCCESS",
      },
    ],
    activity: [],
    pushedAt: "2026-10-01T10:00:00Z",
    labeledAt: {},
    ...overrides,
  };
}
