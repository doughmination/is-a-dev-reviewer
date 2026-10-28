/* lib/core/fixes.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { Failure } from "./checks.ts";

// turns failed checks into "here's what's wrong with your file and exactly how to fix it", using the
// author's own values, plus ```suggestion blocks and a fully fixed copy of the file when it can be built

export type FixFile = { path: string; changeType: string; content?: string; patch?: string; before?: any; ownerGone?: boolean };
export type Suggestion = { path: string; line: number; start_line?: number; body: string };

const DOCS = "https://docs.is-a.dev";
const TEMPLATE = "https://github.com/is-a-dev/register/blob/main/.github/PULL_REQUEST_TEMPLATE.md";
const TYPES = ["A", "AAAA", "CAA", "CNAME", "DS", "MX", "NS", "SRV", "TLSA", "TXT", "URL"];

const code = (s: string) => `\`${String(s).replace(/`/g, "")}\``;
const base = (p: string) => p.split("/").pop() ?? p;
const nameOf = (p: string) => base(p).replace(/\.json$/, "");
const cap = (s: string) => s.replace(/^./, (x) => x.toUpperCase());

// right side line numbers github will accept review comments on
function diffLines(f: FixFile): Set<number> | "all" | null {
  if (f.changeType === "ADDED") return "all";
  if (!f.patch) return null;
  const out = new Set<number>();
  let n = 0;
  for (const l of f.patch.split("\n")) {
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (h) n = Number(h[1]);
    else if (l.startsWith("-") || l.startsWith("\\")) continue;
    else if (n) out.add(n++);
  }
  return out;
}

function strict(s?: string) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// parse what people actually write: trailing commas, missing commas between lines, smart quotes
function lenient(src?: string): any {
  if (!src) return null;
  const ok = strict(src);
  if (ok) return ok;
  let s = src.replace(/[“”]/g, '"').replace(/,(\s*[}\]])/g, "$1");
  s = s.replace(/(["}\]\de])(\s*\n\s*")/g, "$1,$2");
  return strict(s);
}

const indentOf = (src = "") => src.match(/\n( +|\t)"/)?.[1] ?? "  ";
const isObj = (v: any) => !!v && typeof v === "object" && !Array.isArray(v);

type Ctx = {
  file?: FixFile;
  lines: string[];
  data: any;
  author: string;
  name: string; // subdomain the file is for
  extra: Map<string, any>; // other files the fix needs, e.g. a _vercel file
};

type Rule = {
  re: RegExp;
  how: (m: RegExpMatchArray, c: Ctx) => string;
  // line level fix for a review suggestion (0 based index, replacement text)
  fix?: (m: RegExpMatchArray, c: Ctx) => { at: number; from?: number; text: string } | null;
  // change the parsed file, for the fully fixed copy
  patch?: (m: RegExpMatchArray, c: Ctx) => void;
};

const find = (lines: string[], re: RegExp) => lines.findIndex((l) => re.test(l));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rec = (c: Ctx, k: string) => (isObj(c.data?.records) ? c.data.records[k] : undefined);
const shown = (v: any) => code(typeof v === "string" ? v : JSON.stringify(v));

function dropLine(lines: string[], i: number) {
  if (i < 0) return null;
  if (/,\s*$/.test(lines[i])) return { at: i, text: "" };
  const prev = i - 1;
  if (prev < 0 || !/,\s*$/.test(lines[prev])) return { at: i, text: "" };
  return { at: i, from: prev, text: lines[prev].replace(/,\s*$/, "") };
}

const cleanHost = (v: string) =>
  v.trim().replace(/^[a-z]+:\/\//i, "").replace(/[/?#].*$/, "").replace(/\.$/, "").toLowerCase();
const hostOk = (h: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h);

const privateIp = (ip: string) => /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(ip);

const TUNNEL: Record<string, string> = {
  ".cfargotunnel.com": "Cloudflare Tunnel",
  ".trycloudflare.com": "Cloudflare quick tunnel",
  ".ts.net": "Tailscale",
};

const ownerOf = (v: any) => (isObj(v?.owner) ? String(v.owner.username ?? "") : "");

function splitTxt(c: Ctx, pick: (t: string) => boolean) {
  const r = c.data?.records;
  if (!isObj(r)) return [];
  const all: any[] = [].concat(r.TXT ?? []);
  const hit = all.filter((t) => pick(String(t)));
  if (!hit.length) return [];
  const keep = all.filter((t) => !hit.includes(t));
  if (keep.length) r.TXT = keep.length === 1 ? keep[0] : keep;
  else delete r.TXT;
  return hit;
}

// first spot where a comma is missing between lines or left after the last item
function jsonFix(L: string[]) {
  for (let i = 0; i < L.length - 1; i++) {
    const cur = L[i].trimEnd();
    if (!cur.trim()) continue;
    const nextIdx = L.findIndex((l, j) => j > i && l.trim());
    if (nextIdx < 0) break;
    const next = L[nextIdx].trim();
    if (cur.endsWith(",") && /^[}\]]/.test(next)) return { at: i, text: cur.replace(/,$/, "") };
    if (/["}\]\de]$/.test(cur) && !/[{[,:]$/.test(cur) && /^["{[]/.test(next)) return { at: i, text: `${cur},` };
  }
  return null;
}

const RULES: Rule[] = [
  // ---- file names
  {
    re: /JSON files should not be in the root directory/i,
    how: (_, c) => {
      const f = c.file?.path ?? "";
      return f && !f.includes("/")
        ? `${code(f)} is in the root of the repo. Move it into the ${code("domains/")} folder: ${code(`domains/${f}`)}.`
        : `a JSON file was added in the root of the repo. Domain files go inside the ${code("domains/")} folder, e.g. ${code("domains/yourname.json")}.`;
    },
  },
  {
    re: /File name should be all lowercase/i,
    how: (_, c) => {
      const n = base(c.file?.path ?? c.name + ".json");
      return `file names have to be lowercase. Rename ${code(n)} to ${code(n.toLowerCase())}.`;
    },
  },
  {
    re: /File does not have \.json extension/i,
    how: (_, c) => `the file is missing the ${code(".json")} extension. Rename ${code(c.file?.path ?? c.name)} to ${code((c.file?.path ?? c.name) + ".json")}.`,
  },
  {
    re: /File name should not contain \.is-a\.dev/i,
    how: (_, c) => `the file name is just the subdomain, without ${code(".is-a.dev")}. Rename it to ${code(`domains/${c.name.replace(/\.is-a\.dev$/, "")}.json`)}.`,
  },
  {
    re: /consecutive hyphens/i,
    how: (_, c) => `the name can't have two hyphens in a row. Rename it to something like ${code(c.name.replace(/-+/g, "-") + ".json")}.`,
  },
  {
    re: /FQDN must be/i,
    how: (_, c) => {
      const n = base(c.file?.path ?? c.name);
      return /\s/.test(n)
        ? `the file name has a space in it (${code(n)}). Rename it to ${code(n.replace(/\s+/g, ""))}.`
        : `${code(n)} isn't a valid subdomain name. Only lowercase letters, numbers, single hyphens and dots, and it can't start or end with a hyphen.`;
    },
  },
  {
    re: /Root subdomains should not start with an underscore/i,
    how: () => `only nested records (like ${code("_vercel.yourname")}) can start with an underscore, the subdomain itself can't. Pick a name without the leading ${code("_")}.`,
  },
  {
    re: /should not contain is-a-dev/i,
    how: () => `the name can't contain ${code("is-a-dev")}. Please pick a different one.`,
  },
  {
    re: /Subdomain name is (reserved|registered internally)/i,
    how: (_, c) => `${code(`${c.name}.is-a.dev`)} is reserved, so it can't be registered. Please pick a different name and rename the file.`,
  },

  // ---- json and fields
  {
    re: /Invalid JSON(?: file)?(?::\s*(.+))?/i,
    how: (m, c) => {
      const why = m[1] ?? "";
      const fx = jsonFix(c.lines);
      if (fx) {
        const was = c.lines[fx.at].trim();
        return fx.text.trimEnd().endsWith(",")
          ? `the file isn't valid JSON: line ${fx.at + 1} (${code(was)}) is missing a comma at the end.`
          : `the file isn't valid JSON: line ${fx.at + 1} (${code(was)}) has a comma after the last item. Remove it.`;
      }
      const pos = why.match(/line (\d+) column (\d+)/);
      if (pos && c.lines.length) {
        const n = Number(pos[1]);
        let p = n - 2;
        while (p >= 0 && !c.lines[p].trim()) p--;
        const prev = c.lines[p]?.trimEnd() ?? "";
        if (/expected ',' or/i.test(why) && prev && !/[{[,]$/.test(prev))
          return `the file isn't valid JSON: line ${p + 1} (${code(prev.trim())}) is missing a comma at the end.`;
        if (/expected double-quoted property name/i.test(why) && /,$/.test(prev))
          return `the file isn't valid JSON: line ${p + 1} (${code(prev.trim())}) has a comma after the last item. Remove it.`;
        return `the file isn't valid JSON around line ${n} (${code(c.lines[n - 1]?.trim() ?? "")}). Check for a missing comma, quote or bracket there.`;
      }
      return `the file isn't valid JSON. Usually that's a comma after the last item, a missing comma between lines or a missing quote.`;
    },
    fix: (_, c) => jsonFix(c.lines),
  },
  {
    re: /Duplicate keys? found:?\s*(.*)/i,
    how: (m) => `${m[1] ? code(m[1]) : "a key"} shows up more than once. Each key can only be there once, so merge them (e.g. one ${code(`"TXT": ["a", "b"]`)} instead of two TXT keys).`,
  },
  {
    re: /Missing required field: owner\.username/i,
    how: (_, c) => `${code("owner")} needs your GitHub username: ${code(`"username": "${c.author}"`)}.`,
    fix: (_, c) => {
      const i = find(c.lines, /"owner"\s*:\s*\{\s*$/);
      if (i < 0) return null;
      const next = c.lines[i + 1] ?? "";
      const closes = next.trim().startsWith("}");
      const ind = closes ? c.lines[i].match(/^\s*/)![0] + "  " : next.match(/^\s*/)![0];
      return { at: i, text: `${c.lines[i]}\n${ind}"username": "${c.author}"${closes ? "" : ","}` };
    },
    patch: (_, c) => {
      c.data.owner = { username: c.author, ...(isObj(c.data.owner) ? c.data.owner : {}) };
    },
  },
  {
    re: /Missing required field: owner$/i,
    how: (_, c) => `there's no ${code("owner")} block. Add ${code(`"owner": { "username": "${c.author}", "email": "you@example.com" }`)} with an email you actually read.`,
  },
  {
    re: /Missing required field: records/i,
    how: (_, c) => {
      const d = c.data ?? {};
      if (d.record) return `it's ${code("records")} (plural), not ${code("record")}.`;
      const loose = Object.keys(d).filter((k) => TYPES.includes(k.toUpperCase()));
      if (loose.length) return `${loose.map(code).join(" and ")} has to go inside a ${code("records")} object, not at the top level of the file.`;
      return `there's no ${code("records")} object, so the subdomain wouldn't point anywhere. For GitHub Pages that's ${code(`"records": { "CNAME": "${c.author.toLowerCase()}.github.io" }`)}, other hosts are in ${DOCS}.`;
    },
    patch: (_, c) => {
      const d = c.data;
      if (isObj(d.record)) {
        d.records = d.record;
        delete d.record;
        return;
      }
      const loose = Object.keys(d).filter((k) => TYPES.includes(k.toUpperCase()));
      if (!loose.length) return;
      d.records = {};
      for (const k of loose) {
        d.records[k.toUpperCase()] = d[k];
        delete d[k];
      }
    },
  },
  {
    re: /Missing required field: (\S+)/i,
    how: (m) => `the required field ${code(m[1])} is missing.`,
  },
  {
    re: /Disallowed field: (\S+)/i,
    how: (m) => {
      const f = m[1];
      if (f === "record") return `it's ${code("records")} (plural), not ${code("record")}.`;
      if (TYPES.includes(f.toUpperCase())) return `${code(f)} has to go inside ${code("records")}, not at the top level.`;
      if (/^(domain|subdomain|name|description|repo|website|url)$/i.test(f))
        return `remove ${code(f)}: the subdomain comes from the file name, so it doesn't go in the file. Only ${code("owner")}, ${code("records")}, ${code("proxied")} and ${code("redirect_config")} are allowed.`;
      return `${code(f)} isn't allowed in a domain file, remove it. Only ${code("owner")}, ${code("records")}, ${code("proxied")} and ${code("redirect_config")} go in there.`;
    },
    fix: (m, c) => {
      if (m[1] === "record") {
        const i = find(c.lines, /"record"\s*:/);
        return i < 0 ? null : { at: i, text: c.lines[i].replace(/"record"(\s*:)/, '"records"$1') };
      }
      if (TYPES.includes(m[1].toUpperCase())) return null;
      const i = find(c.lines, new RegExp(`^\\s*"${esc(m[1])}"\\s*:\\s*("[^"]*"|[\\d.]+|true|false|null)\\s*,?\\s*$`));
      return dropLine(c.lines, i);
    },
    patch: (m, c) => {
      const f = m[1];
      const d = c.data;
      if (!(f in d)) return;
      if (f === "record") d.records = { ...(isObj(d.record) ? d.record : {}), ...(isObj(d.records) ? d.records : {}) };
      else if (TYPES.includes(f.toUpperCase())) d.records = { ...(isObj(d.records) ? d.records : {}), [f.toUpperCase()]: d[f] };
      delete d[f];
    },
  },
  {
    re: /Field (\S+) should be of type (\S+)/i,
    how: (m, c) => {
      const v = m[1].split(".").reduce((o: any, k) => o?.[k], c.data);
      return `${code(m[1])} has to be ${/^[aeiou]/i.test(m[2]) ? "an" : "a"} ${m[2]}${v !== undefined ? `, right now it's ${shown(v)}` : ""}.`;
    },
    patch: (m, c) => {
      if (m[1] === "proxied" && m[2] === "boolean") c.data.proxied = String(c.data.proxied) === "true";
    },
  },
  {
    re: /Owner email should not be a GitHub no-reply email/i,
    how: () => `the owner email can't be a GitHub no-reply address (we need a way to reach you). Use an email you actually read, or remove ${code("email")} and add another contact like ${code(`"discord": "yourname"`)}.`,
  },
  {
    re: /Owner email should be a valid email address/i,
    how: () => `the owner email isn't a valid email address. Fix it, or remove ${code("email")} and add another contact like ${code(`"discord": "yourname"`)}.`,
  },

  // ---- ownership
  {
    re: /(\S+) is not authorized to (update|delete) (\S+?)\.?$/i,
    how: (m, c) => {
      const was = ownerOf(c.file?.before);
      const now = ownerOf(c.data);
      const sub = code(m[3]);
      if (c.file?.changeType === "ADDED") {
        // a new file: either the username is wrong, or this is a side effect of another failure (missing parent)
        return now && now.toLowerCase() !== c.author.toLowerCase()
          ? `${code("owner.username")} has to be your own GitHub username, ${code(c.author)}, not ${code(now)}.`
          : "";
      }
      if (was && c.file?.ownerGone)
        return `${sub} is registered to ${code(was)}, and that GitHub account doesn't exist anymore. If ${code(was)} was your old username (you renamed the account), reply here saying so and a maintainer can check and move it over. Otherwise it can't be changed from your account.`;
      if (was && now && now.toLowerCase() === c.author.toLowerCase() && was.toLowerCase() !== now.toLowerCase())
        return `${sub} is registered to ${code(was)}, and changing ${code("owner.username")} to your name doesn't move it to you. If ${code(was)} is your old GitHub username (you renamed the account), say so here and a maintainer will check. Otherwise it has to be changed from the ${code(was)} account.`;
      return `${sub} belongs to ${was ? code(was) : "another account"}, so it can't be ${m[2]}d from ${code(m[1])}. You can only change files where ${code("owner.username")} is your own account.`;
    },
    patch: (_, c) => {
      if (c.file?.changeType === "ADDED" && isObj(c.data.owner)) c.data.owner.username = c.author;
    },
  },
  {
    re: /Owner does not match the parent subdomain/i,
    how: (_, c) => {
      const parent = c.name.split(".").slice(1).join(".");
      return `${code(base(c.file?.path ?? c.name))} is under ${code(`${parent}.is-a.dev`)}, so ${code("owner.username")} has to be exactly the same as in ${code(`domains/${parent}.json`)}.`;
    },
  },
  {
    re: /Parent subdomain "?([^"\s]+)"? does not exist/i,
    how: (m) => `${code(`${m[1]}.is-a.dev`)} isn't registered yet, and records under it need the parent first. Add ${code(`domains/${m[1]}.json`)} in this PR too (or get that one merged first).`,
  },
  {
    re: /Parent subdomain "?([^"\s]+)"? has NS records/i,
    how: (m) => `${code(`${m[1]}.is-a.dev`)} uses its own nameservers (NS records), so anything under it has to be set up in that DNS provider, not here.`,
  },
  {
    re: /^(?:[a-z0-9-]+ - )?.*\.is-a\.dev, .*\.is-a\.dev$/i,
    how: () => `each account can only have one single character subdomain.`,
  },

  // ---- records
  {
    re: /Invalid record type: (\S+)/i,
    how: (m) => {
      const k = m[1];
      if (/^www$/i.test(k)) return `${code("www")} isn't a record type. For www.yourname.is-a.dev make a second file: ${code("domains/www.yourname.json")}.`;
      if (TYPES.includes(k.toUpperCase())) return `record types have to be uppercase: ${code(k.toUpperCase())}, not ${code(k)}.`;
      return `${code(k)} isn't a record type. The allowed ones are ${TYPES.join(", ")}.`;
    },
    fix: (m, c) => {
      if (!TYPES.includes(m[1].toUpperCase())) return null;
      const i = find(c.lines, new RegExp(`"${esc(m[1])}"\\s*:`));
      return i < 0 ? null : { at: i, text: c.lines[i].replace(`"${m[1]}"`, `"${m[1].toUpperCase()}"`) };
    },
    patch: (m, c) => {
      const r = c.data.records;
      if (!isObj(r) || !TYPES.includes(m[1].toUpperCase()) || !(m[1] in r)) return;
      r[m[1].toUpperCase()] = r[m[1]];
      delete r[m[1]];
    },
  },
  {
    re: /Record value for (\w+) should be an array/i,
    how: (m, c) => `${m[1]} records go in a list even with one value: ${code(`"${m[1]}": [${JSON.stringify(rec(c, m[1]) ?? "value")}]`)}.`,
    fix: (m, c) => {
      const i = find(c.lines, new RegExp(`"${m[1]}"\\s*:\\s*"[^"]*"`));
      return i < 0 ? null : { at: i, text: c.lines[i].replace(new RegExp(`("${m[1]}"\\s*:\\s*)("[^"]*")`), "$1[$2]") };
    },
    patch: (m, c) => {
      const v = rec(c, m[1]);
      if (v !== undefined && !Array.isArray(v)) c.data.records[m[1]] = [v];
    },
  },
  {
    re: /Record value for (\w+) should be a string$/i,
    how: (m, c) => {
      const v = rec(c, m[1]);
      return `${m[1]} takes a single value, not a list: ${code(`"${m[1]}": ${JSON.stringify(Array.isArray(v) ? v[0] : "value")}`)}.`;
    },
    patch: (m, c) => {
      const v = rec(c, m[1]);
      if (Array.isArray(v) && v.length === 1) c.data.records[m[1]] = v[0];
    },
  },
  {
    re: /Record value for (\w+) must start with http/i,
    how: (m, c) => `the ${m[1]} record has to be a full link: ${code(`https://${String(rec(c, m[1]) ?? "example.com").replace(/^\/+/, "")}`)}.`,
    patch: (m, c) => {
      const v = rec(c, m[1]);
      if (typeof v === "string" && /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) c.data.records[m[1]] = `https://${v}`;
    },
  },
  {
    re: /Invalid URL for (\w+)/i,
    how: (m, c) => `the ${m[1]} record (${shown(rec(c, m[1]) ?? "")}) has to be a full link starting with ${code("https://")}.`,
    fix: (_, c) => {
      const i = find(c.lines, /"URL"\s*:\s*"[^"]*"/);
      if (i < 0) return null;
      const v = c.lines[i].match(/"URL"\s*:\s*"([^"]*)"/)![1];
      if (/^[a-z]+:\/\//i.test(v) || !/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return null;
      return { at: i, text: c.lines[i].replace(`"${v}"`, `"https://${v}"`) };
    },
  },
  {
    re: /Invalid hostname for (\w+)(?: at index (\d+))?/i,
    how: (m, c) => {
      let v = rec(c, m[1]);
      if (m[2] != null && Array.isArray(v)) v = v[Number(m[2])];
      if (isObj(v)) v = v.target ?? v.exchange ?? v.value;
      const s = typeof v === "string" ? v : "";
      const clean = s ? cleanHost(s) : "";
      if (s && clean !== s && hostOk(clean))
        return `${m[1]} has to be just a hostname, without ${/^[a-z]+:\/\//i.test(s) ? code(s.match(/^[a-z]+:\/\//i)![0]) : "a path"} or a trailing slash. So ${code(clean)} instead of ${code(s)}.`;
      return `${s ? code(s) : "that"} isn't a valid hostname for the ${m[1]} record. It should look like ${code("you.github.io")}.`;
    },
    fix: (m, c) => {
      const i = find(c.lines, new RegExp(`"${m[1]}"\\s*:\\s*"[^"]*"`));
      if (i < 0) return null;
      const v = c.lines[i].match(new RegExp(`"${m[1]}"\\s*:\\s*"([^"]*)"`))![1];
      const clean = cleanHost(v);
      if (clean === v || !hostOk(clean)) return null;
      return { at: i, text: c.lines[i].replace(`"${v}"`, `"${clean}"`) };
    },
    patch: (m, c) => {
      const v = rec(c, m[1]);
      if (typeof v !== "string") return;
      const clean = cleanHost(v);
      if (hostOk(clean)) c.data.records[m[1]] = clean;
    },
  },
  {
    re: /(\w+) cannot point to itself/i,
    how: (m) => `the ${m[1]} points back at the same subdomain. It has to point to where your site is hosted (e.g. ${code("you.github.io")}).`,
  },
  {
    re: /(\w+) cannot point to is-a\.dev/i,
    how: (m) => `the ${m[1]} can't point to is-a.dev itself. Point it to where your site is hosted (e.g. ${code("you.github.io")}).`,
  },
  {
    re: /(\w+) cannot (?:end with|be) (\S+)/i,
    how: (m) => {
      const t = TUNNEL[m[2]];
      if (t) return `${t} hostnames (${code(m[2])}) can't be used. Host the site somewhere public (GitHub Pages, Vercel, Netlify, Cloudflare Pages...) and point the ${m[1]} there, or use an A record to a server with a public IP.`;
      if (/workers\.dev|r2\.dev|blob\.core/.test(m[2])) return `${code(m[2])} can't be used as a ${m[1]} target. Cloudflare Pages, GitHub Pages, Vercel or Netlify work fine instead.`;
      if (/^\.(tk|ml|ga|cf|gq)$/.test(m[2])) return `free ${code(m[2])} domains can't be used as a ${m[1]} target (they get abused a lot). Point it to your host directly instead.`;
      return `${code(m[2])} isn't allowed as a ${m[1]} target.`;
    },
  },
  {
    re: /CNAME records cannot be combined with A or AAAA/i,
    how: (_, c) => `a CNAME can't sit next to A / AAAA records. Keep ${rec(c, "CNAME") ? `the CNAME (${shown(rec(c, "CNAME"))})` : "the CNAME"} or the IPs, not both. If your host told you to add both, the CNAME is usually the one to keep.`,
  },
  {
    re: /CNAME records cannot be combined with other records/i,
    how: (_, c) => {
      const others = Object.keys(c.data?.records ?? {}).filter((k) => k !== "CNAME");
      return `a CNAME can't be combined with ${others.length ? others.join(" / ") : "other records"} unless the domain is proxied. Either add ${code(`"proxied": true`)} next to ${code("records")}, or use A / AAAA records instead of the CNAME.`;
    },
  },
  {
    re: /NS records cannot be combined/i,
    how: () => `with NS records the whole subdomain is handled by your own DNS provider, so other records go there instead. Keep only NS (and DS if you use DNSSEC).`,
  },
  {
    re: /URL records cannot be combined/i,
    how: () => `a URL record is a redirect, so it can't be combined with A, AAAA or CNAME. Keep either the redirect or the hosting records.`,
  },
  {
    re: /DS records must be combined with NS/i,
    how: () => `DS records only work together with NS records. Add your NS records, or remove the DS.`,
  },
  {
    re: /Invalid IPv4 address for (\w+)(?: at index (\d+))?/i,
    how: (m, c) => {
      const list = rec(c, m[1]);
      const v = m[2] != null && Array.isArray(list) ? list[Number(m[2])] : list;
      if (typeof v === "string" && privateIp(v)) return `${code(v)} is a private / local IP, it only works inside your own network. Use your server's public IP.`;
      if (typeof v === "string" && /[a-z]/i.test(v)) return `${code(v)} is a hostname, not an IP. Use a CNAME for hostnames: ${code(`"CNAME": "${cleanHost(v)}"`)}.`;
      return `${typeof v === "string" ? code(v) : `item ${Number(m[2] ?? 0) + 1} of the ${m[1]} list`} isn't a valid public IPv4 address.`;
    },
  },
  {
    re: /Invalid IPv6 address for (\w+)/i,
    how: (m) => `the ${m[1]} record has an invalid or non public IPv6 address.`,
  },
  {
    re: /Invalid (\w+) for (\w+) at index (\d+)/i,
    how: (m) => `item ${Number(m[3]) + 1} of the ${m[2]} records has an invalid ${code(m[1])}. The format for each record type is in ${DOCS}.`,
  },
  {
    re: /Record value for (\w+) should be an object/i,
    how: (m) => `each ${m[1]} record has to be an object. The format is in ${DOCS}.`,
  },
  {
    re: /Root subdomains (?:should|must) have at least one|Missing DNS records/i,
    how: (_, c) =>
      `the subdomain needs at least one record that points somewhere: CNAME, A, AAAA, URL, MX or NS. TXT records alone don't count${rec(c, "TXT") ? `, so add e.g. ${code(`"CNAME": "${c.author.toLowerCase()}.github.io"`)} next to the TXT` : ""}.`,
  },
  {
    re: /TXT record cannot contain 'github-pages-challenge'/i,
    how: (_, c) => `the GitHub Pages verification TXT goes in its own file, ${code(`domains/_github-pages-challenge-${c.author.toLowerCase()}.${c.name}.json`)}, not in this one.`,
  },
  {
    re: /vc-domain-verify TXT records are only allowed in files starting with _vercel/i,
    how: (_, c) => `the Vercel ${code("vc-domain-verify=...")} TXT has to go in its own file, ${code(`domains/_vercel.${c.name}.json`)}, and come out of this one.`,
    patch: (_, c) => {
      const vc = splitTxt(c, (t) => t.includes("vc-domain-verify"));
      if (vc.length) c.extra.set(`domains/_vercel.${c.name}.json`, { owner: c.data.owner ?? { username: c.author }, records: { TXT: vc.length === 1 ? vc[0] : vc } });
    },
  },
  {
    re: /Files starting with '_vercel' must have format/i,
    how: (_, c) => `Vercel verification files are named ${code("_vercel.<name>.json")}, where ${code("<name>")} is your subdomain, e.g. ${code(`domains/_vercel.${c.name.replace(/^_vercel[.-]?/, "") || "yourname"}.json`)}.`,
  },
  {
    re: /Files starting with '_vercel' can only have TXT/i,
    how: () => `the ${code("_vercel")} file is only for the Vercel TXT record. The CNAME / A record goes in your main file.`,
  },
  {
    re: /Vercel verification files must contain/i,
    how: () => `the ${code("_vercel")} file needs the TXT value Vercel shows you, it starts with ${code("vc-domain-verify=")}.`,
  },
  {
    re: /Vercel TXT record domain \(([^)]+)\) must be '([^']+)'/i,
    how: (m) => `the TXT value is for ${code(m[1])}, but this file is for ${code(m[2])}. Copy the TXT Vercel shows for ${code(m[2])}.`,
  },

  // ---- proxy and redirects
  {
    re: /Proxied is true but there are no records that can be proxied/i,
    how: () => `${code(`"proxied": true`)} only works with A, AAAA or CNAME records. Remove ${code("proxied")} or add one of those.`,
    patch: (_, c) => void delete c.data.proxied,
  },
  {
    re: /raw\.is-a\.dev cannot be proxied/i,
    how: () => `this one can't be proxied, remove ${code("proxied")}.`,
    patch: (_, c) => void delete c.data.proxied,
  },
  {
    re: /Redirect config must be combined with a URL record|redirect_paths requires a URL/i,
    how: () => `${code("redirect_config")} only works together with a ${code("URL")} record (or with ${code(`"proxied": true`)}). Add the URL record or remove ${code("redirect_config")}.`,
  },
  {
    re: /Custom path in redirect_config/i,
    how: () => `redirect paths have to start with ${code("/")}, can only have letters, numbers, ${code("-_./")} and can't end with a slash. Example: ${code(`"redirect_paths": { "/blog": "https://you.github.io/blog" }`)}.`,
  },
];

const LABELS: Record<string, string> = {
  TOS: "I agree to the Terms of Service",
  DOMAIN_STRUCTURE: "the file follows the domain structure",
  WEBSITE_REACHABLE: "the website is reachable",
  SOFTWARE_RELATED: "the site is software development related",
  NON_COMMERCIAL: "the site is not commercial",
  CONTACT_INFO: "there's contact info in the file",
  WEBSITE_LINK: "the preview link is filled in",
};

// the PR template check: tell them exactly which boxes and sections, and where things go
function explainTemplate(details: string[], body: string): string {
  const boxes = details.map((d) => d.match(/`(\w+)` requirement has not been checked/)?.[1]).filter(Boolean) as string[];
  const preview = details.some((d) => /Website Preview/i.test(d));
  const purpose = details.some((d) => /Website Purpose/i.test(d));
  if (!body.includes("WEBSITE_PREVIEW_START") && /website preview/i.test(body))
    return `the hidden ${code("<!-- ... -->")} markers from the PR template got removed, and the check needs them to read your description. Edit the description, paste the template from ${TEMPLATE} back in as is, then tick the boxes with ${code("[x]")} and fill in the preview link and purpose.`;
  if (!body.includes("WEBSITE_PREVIEW_START") || boxes.length >= 7)
    return `the PR description doesn't have the template anymore. Edit the description, paste the full template from ${TEMPLATE} back in, tick every box with ${code("[x]")} and fill in the preview link and purpose.`;
  const out: string[] = [];
  if (boxes.length) {
    const fuzzy = /-\s*\[\s+[xX]\s*\]|-\s*\[[xX]\s+\]|-\s*\[X\]/.test(body);
    const list = boxes.map((b) => (LABELS[b] ? `${code(b)} (${LABELS[b]})` : code(b))).join(", ");
    out.push(
      `tick ${boxes.length === 1 ? "this box" : "these boxes"}: ${list}. It has to be exactly ${code("[x]")}${fuzzy ? `, lowercase with no spaces (not ${code("[ x ]")} or ${code("[X]")})` : ""}.`,
    );
  }
  if (preview) {
    const outside = body.replace(/<!--[\s\S]*?-->/g, "").match(/https?:\/\/(?!github\.com\/(?:user-attachments|is-a-dev)|(?:[\w-]+\.)?is-a\.dev\b)[^\s)<>\]]+/);
    out.push(
      outside
        ? `put your link ${code(outside[0])} between the ${code("<!-- WEBSITE_PREVIEW_START -->")} and ${code("<!-- WEBSITE_PREVIEW_END -->")} lines, the check only looks there.`
        : `add the link to where your site is hosted right now (e.g. ${code("https://you.github.io")}) between ${code("<!-- WEBSITE_PREVIEW_START -->")} and ${code("<!-- WEBSITE_PREVIEW_END -->")}. A link, not a screenshot.`,
    );
  }
  if (purpose) out.push(`write a sentence about what the site is (e.g. "my portfolio") between ${code("<!-- WEBSITE_PURPOSE_START -->")} and ${code("<!-- WEBSITE_PURPOSE_END -->")}.`);
  if (!out.length) return "the PR description template isn't filled in.";
  return out.length > 1 ? `the PR description isn't filled in yet:\n${out.map((o) => `  - ${cap(o)}`).join("\n")}` : `in the PR description, ${out[0]}`;
}

export type Explained = { text: string; suggestions: Suggestion[] };

export function explain(fails: Failure[], files: FixFile[], author: string, body = ""): Explained {
  const groups = new Map<string, string[]>();
  const suggestions: Suggestion[] = [];
  const add = (line: string, file = "") => {
    const g = groups.get(file) ?? [];
    if (!g.includes(line)) g.push(line);
    groups.set(file, g);
  };
  const jsonFiles = files.filter((f) => f.changeType !== "DELETED" && f.path.endsWith(".json"));
  const ctxs = new Map<string, Ctx>();
  const ctxFor = (file?: FixFile, fallback = ""): Ctx => {
    const key = file?.path ?? fallback;
    let c = ctxs.get(key);
    if (!c) {
      c = { file, lines: file?.content?.split("\n") ?? [], data: lenient(file?.content), author, name: nameOf(file?.path ?? fallback), extra: new Map() };
      ctxs.set(key, c);
    }
    return c;
  };
  const done = new Set<string>();

  const tpl = fails.filter((f) => f.test === "PR template").flatMap((f) => f.details);
  if (tpl.length) add(explainTemplate(tpl, body));
  for (const f of fails) {
    if (f.test === "PR template") continue;
    for (const d of f.details) {
      if (/^PR template is incomplete|exited with a non-zero exit code|tests? failed$/i.test(d)) continue;
      const m = d.match(/^(_?[\w.-]+(?: [\w.-]+)?(?:\.json)?): (.+)$/);
      let fname: string | null = m?.[1] ?? null;
      const msg = m ? m[2] : d;
      if (!m && /^Invalid JSON/i.test(d) && jsonFiles.length === 1) fname = base(jsonFiles[0].path);
      if (!m && /root directory/i.test(d)) fname = jsonFiles.find((x) => !x.path.includes("/"))?.path ?? null;
      const file = fname ? files.find((x) => x.path === fname || base(x.path) === fname || x.path === `domains/${fname}`) : undefined;
      const where = fname ? file?.path ?? (fname.includes("/") ? fname : `domains/${fname}`) : "";
      const c = ctxFor(file, fname ?? "");
      const rule = RULES.find((r) => r.re.test(msg));
      if (!rule) {
        // something new the rules don't know: keep the plain message, never raw log output
        add(msg.replace(/^./, (x) => x.toLowerCase()).replace(/\.?$/, "."), where);
        continue;
      }
      const hit = msg.match(rule.re)!;
      const text = rule.how(hit, c);
      if (!text) continue;
      add(text, where);
      if (rule.patch && c.data && !done.has(where + msg)) {
        done.add(where + msg);
        try {
          rule.patch(hit, c);
        } catch {}
      }
      const fx = file && c.lines.length ? rule.fix?.(hit, c) : null;
      if (!fx || !file) continue;
      const ok = diffLines(file);
      const start = (fx.from ?? fx.at) + 1;
      const end = fx.at + 1;
      if (!ok || (ok !== "all" && !(ok.has(start) && ok.has(end)))) continue;
      if (suggestions.some((s) => s.path === file.path && s.line === end)) continue;
      suggestions.push({
        path: file.path,
        line: end,
        ...(start !== end ? { start_line: start } : {}),
        body: `${cap(text)}\n\n\`\`\`suggestion\n${fx.text}\n\`\`\``,
      });
    }
  }

  const out: string[] = [];
  for (const [file, probs] of groups) {
    if (!file) out.push(...probs.map((p) => `- ${cap(p)}`));
    else if (probs.length === 1) out.push(`- **${code(file)}**: ${probs[0]}`);
    else out.push(`- **${code(file)}**\n${probs.map((p) => `  - ${cap(p)}`).join("\n")}`);
  }
  if (!out.length) out.push("- The checks failed, but the log didn't say why. Open the Checks tab on this PR for the details.");

  // a fixed copy of each small file, when there's no inline suggestion doing the same job
  const blocks: string[] = [];
  for (const [path, c] of ctxs) {
    if (!c.data || !c.file?.content) continue;
    const ind = indentOf(c.file.content);
    const now = JSON.stringify(c.data, null, ind);
    const changed = !strict(c.file.content) || now.replace(/\s/g, "") !== c.file.content.replace(/\s/g, "");
    const covered = suggestions.some((s) => s.path === path);
    if (changed && !covered && now.split("\n").length <= 30) blocks.push(`Here's ${code(path)} with that fixed:\n\n\`\`\`json\n${now}\n\`\`\``);
    for (const [p, d] of c.extra) blocks.push(`And the new file ${code(p)}:\n\n\`\`\`json\n${JSON.stringify(d, null, ind)}\n\`\`\``);
  }
  if (blocks.length) out.push("", blocks.join("\n\n"));
  return { text: out.join("\n"), suggestions };
}
