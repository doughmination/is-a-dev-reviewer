/* lib/core/template.ts
 * MIT Licence — (c) Clove Twilight
 */

export const REQUIREMENTS = [
  { key: "TOS", label: "Agrees to TOS" },
  { key: "DOMAIN_STRUCTURE", label: "Domain structure" },
  { key: "WEBSITE_REACHABLE", label: "Reachable & completed" },
  { key: "SOFTWARE_RELATED", label: "Software dev related" },
  { key: "NON_COMMERCIAL", label: "Not commercial" },
  { key: "CONTACT_INFO", label: "Contact info" },
  { key: "WEBSITE_LINK", label: "Website link provided" },
];

export type BoxState = {
  key: string;
  label: string;
  state: "checked" | "unchecked" | "missing";
  // Lowercase x exactly, like the CI check wants
  strict: boolean;
};

export type Hint = {
  ok: boolean | null;
  text: string;
};

// Links in a body that are never the preview
const NOISE_URL = /(github\.com\/user-attachments|githubusercontent|is-a\.dev\/terms|docs\.is-a\.dev|\.(png|jpe?g|gif|webp)$)/i;

export const stripComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, "");

function between(body: string, startMarker: string, endMarker: string) {
  const startTag = `<!-- ${startMarker} -->`;
  const startIndex = body.indexOf(startTag);
  const endIndex = body.indexOf(`<!-- ${endMarker} -->`);

  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) return null;

  return stripComments(body.slice(startIndex + startTag.length, endIndex)).trim();
}

export function findUrl(text: string, skipNoise = false): string | null {
  const urls = [...text.matchAll(/https?:\/\/[^\s)<>"'\]]+/g)]
    .map((match) => match[0].replace(/[.,]+$/, ""));
  const usable = urls.filter((url) => !skipNoise || !NOISE_URL.test(url));

  if (usable[0]) return usable[0];
  if (skipNoise) return null;

  // Bare domain like abc.vercel.app
  const bare = text.match(/\b([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?/i);
  return bare ? `https://${bare[0]}` : null;
}

function readBox(body: string, key: string, label: string): BoxState {
  const pattern = new RegExp(`^\\s*[-*]\\s*\\[(.?)\\]\\s*<!--\\s*${key}\\s*-->`, "m");
  const match = body.match(pattern);

  if (!match) {
    return {
      key,
      label,
      state: "missing",
      strict: false,
    };
  }

  const mark = match[1];
  return {
    key,
    label,
    state: mark === "x" || mark === "X" ? "checked" : "unchecked",
    strict: mark === "x",
  };
}

export function parseBody(body: string) {
  const boxes = REQUIREMENTS.map(({ key, label }) => readBox(body, key, label));
  const hasTemplate = body.includes("WEBSITE_PREVIEW_START");
  const previewRaw = between(body, "WEBSITE_PREVIEW_START", "WEBSITE_PREVIEW_END");
  const purpose = between(body, "WEBSITE_PURPOSE_START", "WEBSITE_PURPOSE_END");

  const preview = (previewRaw ? findUrl(previewRaw) : null)
    ?? findUrl(stripComments(body), true);

  return {
    boxes,
    hasTemplate,
    preview,
    previewRaw,
    purpose,
    clean: stripComments(body).trim(),
  };
}

export type ParsedBody = ReturnType<typeof parseBody>;

export function analyzeDomainFile(path: string, content: string, author: string | undefined) {
  const hints: Hint[] = [];
  const targets: string[] = [];
  const name = path.replace(/^domains\//, "").replace(/\.json$/, "");
  let json: any = null;

  try {
    json = JSON.parse(content);
    hints.push({ ok: true, text: "valid JSON" });
  } catch (error: any) {
    hints.push({ ok: false, text: `invalid JSON: ${error.message}` });
    return { name, json, hints, targets };
  }

  const owner = json.owner ?? {};
  if (owner.username) {
    const matches = !!author && owner.username.toLowerCase() === author.toLowerCase();
    hints.push({
      ok: matches,
      text: matches ? `owner is @${owner.username}` : `owner @${owner.username} ≠ PR author @${author}`,
    });
  } else {
    hints.push({ ok: false, text: "no owner.username" });
  }

  // Contact info is optional, only mention it when it's there
  const contact = Object.keys(owner).filter((key) => key !== "username");
  if (contact.length) hints.push({ ok: true, text: `contact: ${contact.join(", ")}` });

  const records = json.records ?? {};
  const recordTypes = Object.keys(records);
  if (json.redirect_config) recordTypes.push("redirect_config");
  hints.push({
    ok: recordTypes.length > 0,
    text: recordTypes.length ? `records: ${recordTypes.join(", ")}` : "no records",
  });

  if (/[A-Z]/.test(name)) hints.push({ ok: false, text: "filename has uppercase" });
  if (name.startsWith("_")) hints.push({ ok: null, text: "underscore record (verification)" });
  if (records.NS) hints.push({ ok: null, text: "NS records, needs extra scrutiny" });

  if (typeof records.CNAME === "string") targets.push(`https://${records.CNAME.replace(/\.$/, "")}`);
  if (typeof records.URL === "string") targets.push(records.URL);

  return { name, json, hints, targets };
}
