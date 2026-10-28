/* tests/web.test.ts
 * MIT Licence — (c) Clove Twilight
 */

import { describe, expect, test } from "bun:test";

import { parseBotBody } from "../src/lib/core/profiles";
import { kindOf } from "../src/lib/core/site";
import { checkProxyRequest } from "../src/lib/server/githubProxy";
import { isPlayableName, parseRange } from "../src/lib/server/music";
import type { Session } from "../src/lib/server/session";
import { safeReturnTo } from "../src/lib/server/session";

const BOT_BODY = `# Requirements

- [x] I **agree** to the [Terms of Service](https://is-a.dev/terms). <!-- note -->
- [x] My file is following the [domain structure](https://docs.is-a.dev/domain-structure/).
- [ ] My website is **reachable** and **completed**.
- [x] My website is **not for commercial use**.
- [x] I have provided sufficient contact information in the \`owner\` key.
- [x] I have provided a link to my website below.

# Website Preview
<!-- Provide a link of your website below. -->
https://mybot.vercel.app

# Website Purpose
A dashboard for my discord bot
`;

function sessionWith(register: boolean, bot: boolean): Session {
  return {
    sub: "user-1",
    name: "Clove",
    email: null,
    github: {
      token: "gho_test",
      login: "doughmination",
      id: 1,
      name: "Clove",
      avatar: "",
    },
    access: {
      register,
      bot,
      checkedAt: Date.now(),
    },
    createdAt: Date.now(),
  };
}

describe("is-a.bot template", () => {
  test("reads boxes by their wording", () => {
    const parsed = parseBotBody(BOT_BODY);
    const states = Object.fromEntries(parsed.boxes.map((box) => [box.key, box.state]));

    expect(states.TOS).toBe("checked");
    expect(states.WEBSITE_REACHABLE).toBe("unchecked");
    expect(parsed.boxes).toHaveLength(6);
  });

  test("finds preview and purpose under their headings", () => {
    const parsed = parseBotBody(BOT_BODY);
    expect(parsed.preview).toBe("https://mybot.vercel.app");
    expect(parsed.purpose).toBe("A dashboard for my discord bot");
    expect(parsed.hasTemplate).toBe(true);
  });

  test("is-a.bot homepage counts as the service domain", () => {
    expect(kindOf("https://is-a.bot", null, "is-a.bot")).toBe("isadev");
    expect(kindOf("https://is-a.bot", null, "is-a.dev")).not.toBe("isadev");
  });
});

describe("github proxy rules", () => {
  test("reads are allowed anywhere", () => {
    const verdict = checkProxyRequest(sessionWith(true, false), "GET", "/repos/someone/else/pulls", null);
    expect(verdict.ok).toBe(true);
  });

  test("writes only into repos you review", () => {
    const registerOnly = sessionWith(true, false);
    const mergeRegister = checkProxyRequest(registerOnly, "PUT", "/repos/is-a-dev/register/pulls/1/merge", "{}");
    const mergeBot = checkProxyRequest(registerOnly, "PUT", "/repos/free-domains/is-a.bot/pulls/1/merge", "{}");
    const elsewhere = checkProxyRequest(registerOnly, "DELETE", "/repos/doughmination/web", null);

    expect(mergeRegister.ok).toBe(true);
    expect(mergeBot.ok).toBe(false);
    expect(elsewhere.ok).toBe(false);
  });

  test("bot access opens the bot repo", () => {
    const verdict = checkProxyRequest(sessionWith(true, true), "POST", "/repos/free-domains/is-a.bot/issues/1/comments", "{}");
    expect(verdict.ok).toBe(true);
  });

  test("graphql queries pass, mutations don't", () => {
    const session = sessionWith(true, true);
    const query = JSON.stringify({ query: "query { viewer { login } }" });
    const mutation = JSON.stringify({ query: "mutation { deleteRepository(input: {}) { clientMutationId } }" });

    expect(checkProxyRequest(session, "POST", "/graphql", query).ok).toBe(true);
    expect(checkProxyRequest(session, "POST", "/graphql", mutation).ok).toBe(false);
  });

  test("path tricks are refused", () => {
    const verdict = checkProxyRequest(sessionWith(true, false), "PUT", "/repos/is-a-dev/register/../../other/repo", "{}");
    expect(verdict.ok).toBe(false);
  });
});

describe("session helpers", () => {
  test("return paths stay on this site", () => {
    expect(safeReturnTo("/bot")).toBe("/bot");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo(null)).toBe("/");
  });
});

describe("music", () => {
  test("names", () => {
    expect(isPlayableName("Song [abc].webm")).toBe(true);
    expect(isPlayableName("../x.webm")).toBe(false);
    expect(isPlayableName("notes.txt")).toBe(false);
  });

  test("ranges", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=2000-", 1000)).toBeNull();
  });
});
