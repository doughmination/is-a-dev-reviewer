/* lib/core/profiles.ts
 * MIT Licence — (c) Clove Twilight
 */

import { findUrl, parseBody, stripComments, type BoxState, type ParsedBody } from "./template.ts";

export type ProfileId = "register" | "bot";

export type JudgeQuestion = {
  id: string;
  question: string;
  no: string;
  reply: string;
  skipNested: boolean;
};

export type RepoProfile = {
  id: ProfileId;
  label: string;
  repo: string;
  // The domain people are asking for a subdomain of
  service: string;
  parseBody: (body: string) => ParsedBody;
  judgeQuestions: JudgeQuestion[];
};

const COMMON_QUESTIONS: JudgeQuestion[] = [
  { id: "done", question: "Finished site?", no: "Placeholder / template", reply: "incomplete", skipNested: false },
  { id: "free", question: "Not selling anything?", no: "Commercial", reply: "commercial", skipNested: false },
];

// is-a.bot: plain checkboxes matched by their wording, "# Website Preview" style sections
const BOT_REQUIREMENTS = [
  { key: "TOS", label: "Agrees to TOS", pattern: /agree.*terms of service/i },
  { key: "DOMAIN_STRUCTURE", label: "Domain structure", pattern: /domain structure/i },
  { key: "WEBSITE_REACHABLE", label: "Reachable & completed", pattern: /reachable/i },
  { key: "NON_COMMERCIAL", label: "Not commercial", pattern: /not for commercial/i },
  { key: "CONTACT_INFO", label: "Contact info", pattern: /contact information/i },
  { key: "WEBSITE_LINK", label: "Website link provided", pattern: /link to my website/i },
];

function section(body: string, heading: string) {
  const pattern = new RegExp(`^#{1,3}\\s*${heading}\\s*$([\\s\\S]*?)(?=^#{1,3}\\s|$(?![\\s\\S]))`, "im");
  const match = body.match(pattern);
  return match ? stripComments(match[1]).trim() : null;
}

export function parseBotBody(body: string): ParsedBody {
  const lines = body.split("\n");

  const boxes: BoxState[] = BOT_REQUIREMENTS.map(({ key, label, pattern }) => {
    const line = lines.find((text) => /^\s*[-*]\s*\[.?\]/.test(text) && pattern.test(text));
    if (!line) {
      return {
        key,
        label,
        state: "missing",
        strict: false,
      };
    }

    const mark = line.match(/\[(.?)\]/)?.[1];
    return {
      key,
      label,
      state: mark === "x" || mark === "X" ? "checked" : "unchecked",
      strict: mark === "x",
    };
  });

  const previewRaw = section(body, "Website Preview");
  const purpose = section(body, "Website Purpose");
  const preview = (previewRaw ? findUrl(previewRaw) : null) ?? findUrl(stripComments(body), true);

  return {
    boxes,
    hasTemplate: /^#\s*Requirements/im.test(body) || /^#\s*Website Preview/im.test(body),
    preview,
    previewRaw,
    purpose,
    clean: stripComments(body).trim(),
  };
}

export const PROFILES: Record<ProfileId, RepoProfile> = {
  register: {
    id: "register",
    label: "is-a.dev",
    repo: "is-a-dev/register",
    service: "is-a.dev",
    parseBody,
    judgeQuestions: [
      COMMON_QUESTIONS[0],
      { id: "dev", question: "About software dev?", no: "Not dev related", reply: "not-dev", skipNested: true },
      COMMON_QUESTIONS[1],
      { id: "allowed", question: "No login wall, AI chat, course, proxy?", no: "Banned kind of site", reply: "not-use-case", skipNested: false },
    ],
  },
  bot: {
    id: "bot",
    label: "is-a.bot",
    repo: "free-domains/is-a.bot",
    service: "is-a.bot",
    parseBody: parseBotBody,
    // Bots and AI chatbots are allowed here, and nothing has to be dev related
    judgeQuestions: [
      ...COMMON_QUESTIONS,
      { id: "allowed", question: "No login wall, course, proxy?", no: "Banned kind of site", reply: "not-use-case", skipNested: false },
    ],
  },
};

export function isProfileId(value: string): value is ProfileId {
  return value === "register" || value === "bot";
}
