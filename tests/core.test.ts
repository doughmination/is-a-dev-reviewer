/* tests/core.test.ts
 * MIT Licence — (c) Clove Twilight
 */

import { describe, expect, test } from "bun:test";

import { authorReplied, reviewedBy, waitingOnAuthor } from "../src/lib/core/activity";
import { failText, parseLog, reasonFor, rollupKind } from "../src/lib/core/checks";
import { mapPull } from "../src/lib/core/github";
import { kindOf, vercelDeploy } from "../src/lib/core/site";
import { analyzeDomainFile, parseBody } from "../src/lib/core/template";
import { describeChange, recordMismatch, verdict, type VerdictInput } from "../src/lib/core/verdict";
import { makePull, TICKED_BODY } from "./fixtures";

const okProbe = {
  ok: true,
  status: 200,
  finalUrl: "https://alice.github.io/",
  frameable: true,
  title: "Alice",
  error: null,
};

function verdictInput(overrides: Partial<VerdictInput> = {}): VerdictInput {
  const parsed = parseBody(TICKED_BODY);
  return {
    pull: makePull(),
    boxes: parsed.boxes,
    hasTemplate: parsed.hasTemplate,
    preview: parsed.preview,
    files: [
      {
        path: "domains/alice.json",
        changeType: "ADDED",
        name: "alice",
        json: {
          owner: { username: "alice" },
          records: { CNAME: "alice.github.io" },
        },
      },
    ],
    site: {
      status: 200,
      finalUrl: "https://alice.github.io/",
      kind: "site",
      title: "Alice",
    },
    probing: false,
    pendingRuns: 0,
    failures: [],
    reason: null,
    queue: [],
    trusted: new Set(),
    ...overrides,
  };
}

describe("template", () => {
  test("reads ticked boxes and the preview link", () => {
    const parsed = parseBody(TICKED_BODY);
    expect(parsed.boxes.every((box) => box.state === "checked")).toBe(true);
    expect(parsed.preview).toBe("https://alice.github.io");
    expect(parsed.hasTemplate).toBe(true);
  });

  test("marks an unticked box", () => {
    const parsed = parseBody(TICKED_BODY.replace("[x] <!-- TOS -->", "[ ] <!-- TOS -->"));
    expect(parsed.boxes.find((box) => box.key === "TOS")?.state).toBe("unchecked");
  });

  test("flags an owner that isn't the author", () => {
    const content = JSON.stringify({
      owner: { username: "bob" },
      records: { A: ["1.2.3.4"] },
    });
    const result = analyzeDomainFile("domains/alice.json", content, "alice");
    expect(result.hints.some((hint) => hint.ok === false && hint.text.includes("bob"))).toBe(true);
  });
});

describe("site", () => {
  test("is-a.dev homepage is isadev", () => {
    expect(kindOf("https://is-a.dev", null)).toBe("isadev");
  });

  test("redirect to the requested is-a.dev name is cname", () => {
    const probe = { ...okProbe, finalUrl: "https://alice.is-a.dev/" };
    expect(kindOf("https://alice.github.io", probe)).toBe("cname");
  });

  test("404 is down", () => {
    const probe = { ...okProbe, ok: false, status: 404 };
    expect(kindOf("https://alice.github.io", probe)).toBe("down");
  });

  test("vercel deployment link maps to production", () => {
    expect(vercelDeploy("https://myapp-abc123xyz-alices-projects.vercel.app")).toBe("https://myapp.vercel.app");
  });
});

describe("activity", () => {
  test("reviewer spoke last means already reviewed", () => {
    const pull = makePull({
      activity: [
        { login: "maintainer", at: "2026-10-02T10:00:00Z", bot: false },
      ],
    });
    expect(reviewedBy(pull)?.login).toBe("maintainer");
  });

  test("bots don't count as reviewers", () => {
    const pull = makePull({
      activity: [
        { login: "is-a-dev-reviewbot", at: "2026-10-02T10:00:00Z", bot: false },
      ],
    });
    expect(reviewedBy(pull)).toBeNull();
  });

  test("author pushing after review is a reply", () => {
    const pull = makePull({
      activity: [
        { login: "maintainer", at: "2026-10-02T10:00:00Z", bot: false },
      ],
      pushedAt: "2026-10-03T10:00:00Z",
    });
    expect(authorReplied(pull)?.how).toBe("pushed");
  });

  test("waiting label with no answer stays waiting", () => {
    const pull = makePull({
      labels: [{ name: "status: needs preview", color: "fff" }],
      labeledAt: { "status: needs preview": "2026-10-02T10:00:00Z" },
    });
    expect(waitingOnAuthor(pull)?.label).toBe("status: needs preview");
  });
});

describe("checks", () => {
  test("pulls failures out of a test log", () => {
    const log = [
      "2026-10-24T12:00:00.1234567Z ✘ [fail]: domains › All files should have valid records alice.json: Invalid CNAME",
      "##[error]Process completed with exit code 1.",
    ];
    const failures = parseLog(log);
    expect(failures).toEqual([
      {
        test: "All files should have valid records",
        details: ["alice.json: Invalid CNAME"],
      },
    ]);
    expect(reasonFor(failures)).toBe("reason: incompatible records");
    expect(failText(failures)).toContain("**All files should have valid records**");
  });

  test("rollup goes bad on any failure", () => {
    const checks = [
      { name: "a", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "b", status: "COMPLETED", conclusion: "FAILURE" },
    ];
    expect(rollupKind(checks, "FAILURE")).toBe("bad");
  });
});

describe("verdict", () => {
  test("clean pr is judge with merge allowed", () => {
    const result = verdict(verdictInput());
    expect(result.tone).toBe("judge");
    expect(result.canMerge).toBe(true);
  });

  test("ai marker closes", () => {
    const pull = makePull({ title: "Register alice (dns-preflight)" });
    expect(verdict(verdictInput({ pull })).tone).toBe("close");
  });

  test("unticked box closes", () => {
    const parsed = parseBody(TICKED_BODY.replace("[x] <!-- TOS -->", "[ ] <!-- TOS -->"));
    const result = verdict(verdictInput({ boxes: parsed.boxes }));
    expect(result.tone).toBe("close");
    expect(result.issues[0].id).toBe("tpl");
  });

  test("wrong owner on a new file asks for a fix", () => {
    const files = [
      {
        path: "domains/alice.json",
        changeType: "ADDED",
        name: "alice",
        json: {
          owner: { username: "bob" },
          records: { CNAME: "alice.github.io" },
        },
      },
    ];
    const result = verdict(verdictInput({ files }));
    expect(result.tone).toBe("fix");
    expect(result.issues.find((issue) => issue.id === "owner")?.reply).toBe("wrong-owner");
  });

  test("trusted author bypasses owner check", () => {
    const files = [
      {
        path: "domains/alice.json",
        changeType: "ADDED",
        name: "alice",
        json: {
          owner: { username: "bob" },
          records: { CNAME: "alice.github.io" },
        },
      },
    ];
    const result = verdict(verdictInput({ files, trusted: new Set([1]) }));
    expect(result.issues.some((issue) => issue.id === "owner-bypass")).toBe(true);
  });

  test("preview on a different host than the records warns", () => {
    const files = [
      {
        path: "domains/alice.json",
        name: "alice",
        json: { records: { CNAME: "alice.vercel.app" } },
      },
    ];
    expect(recordMismatch("https://alice.netlify.app", files)).toContain("Netlify");
  });

  test("describeChange lists record edits", () => {
    const before = { records: { CNAME: "a.github.io" } };
    const after = { records: { CNAME: "b.vercel.app", TXT: "x" } };
    expect(describeChange(before, after)).toEqual([
      "CNAME: a.github.io → b.vercel.app",
      "+TXT x",
    ]);
  });
});

describe("github mapping", () => {
  test("keeps the newest check per name and reads label times", () => {
    const node = {
      id: "PR_1",
      number: 5,
      title: "t",
      labels: { nodes: [] },
      timelineItems: {
        nodes: [
          { __typename: "LabeledEvent", createdAt: "2026-10-02T00:00:00Z", label: { name: "x" } },
        ],
      },
      commits: {
        nodes: [{
          commit: {
            oid: "sha",
            committedDate: "2026-10-01T00:00:00Z",
            statusCheckRollup: {
              state: "SUCCESS",
              contexts: {
                nodes: [
                  { __typename: "CheckRun", name: "Tests", status: "COMPLETED", conclusion: "FAILURE" },
                  { __typename: "CheckRun", name: "Tests", status: "COMPLETED", conclusion: "SUCCESS" },
                ],
              },
            },
          },
        }],
      },
    };
    const pull = mapPull(node);
    expect(pull.checks).toHaveLength(1);
    expect(pull.checks[0].conclusion).toBe("SUCCESS");
    expect(pull.labeledAt.x).toBe("2026-10-02T00:00:00Z");
  });
});
