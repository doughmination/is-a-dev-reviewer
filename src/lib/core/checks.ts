/* lib/core/checks.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { Check } from "./types.ts";

export type CheckKind = "ok" | "bad" | "wait" | "none";

export type Failure = {
  test: string;
  details: string[];
};

export function checkKind(check: Check): CheckKind {
  if (check.status !== "COMPLETED") return "wait";

  switch (check.conclusion) {
    case "SUCCESS":
      return "ok";
    case "NEUTRAL":
    case "SKIPPED":
      return "none";
    case "ACTION_REQUIRED":
      return "wait";
    default:
      return "bad";
  }
}

export function rollupKind(checks: Check[], state: string | null): CheckKind {
  if (!checks.length) return "none";

  const kinds = checks.map(checkKind);
  if (kinds.includes("bad")) return "bad";
  if (kinds.includes("wait")) return "wait";
  if (state === "FAILURE" || state === "ERROR") return "bad";

  return "ok";
}

export function jobId(check: Check) {
  return Number(check.url?.match(/\/job\/(\d+)/)?.[1] ?? 0) || null;
}

// A line the tests print about one file: "name.json: what's wrong"
const FILE_MESSAGE = /^(_?[\w.-]+(?: [\w.-]+)?(?:\.json)?): ([A-Z].+)$/;
const NOT_FILE_MESSAGE = /^(Error|TypeError|SyntaxError|TestFailure|Difference|Value is not|Unhandled|message|at |›|tests\/|\d+:)/;
const ANSI = /\x1b\[[0-9;]*m/g;

// Every test in is-a-dev/register/tests, for logs where the name only shows next to its message
const KNOWN_TESTS = [
  "Nested subdomains should not exist without a parent subdomain",
  "Nested subdomains should not exist if any parent subdomain has NS records",
  "Nested subdomains should be owned by the parent subdomain's owner",
  "Users are limited to one single character subdomain",
  "Users can only update their own subdomains",
  "Domains with proxy enabled must have at least one proxy-able record",
  "Domains with specific records must not have proxy enabled",
  "All files should have valid records",
  "Root subdomains should have at least one usable record",
  "All files should have valid required and optional fields",
  "JSON files should not be in the root directory",
  "All files should be valid JSON",
  "All files should have valid file names",
];

function templateFailure(lines: string[]): Failure | null {
  const start = lines.findIndex((line) => line.includes("PR template validation failed"));
  if (start < 0) return null;

  const details: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("##[")) break;
    if (line.trim()) details.push(line.trim().replace(/\*\*/g, ""));
  }

  return { test: "PR template", details };
}

function collectTestNames(lines: string[]) {
  const names = new Set(KNOWN_TESTS);

  for (const line of lines) {
    const match = line.match(/✔\s*\w+ › (.+?)(?: \(\d[\d.]*m?s\))?$/)
      ?? line.match(/^\s*\w+ › ([^:]+)$/);
    if (match) names.add(match[1].trim());
  }

  // Longest first so "a b c" wins over "a b"
  return [...names].sort((first, second) => second.length - first.length);
}

// "Failed to read JSON for x: /path/x.json: <why>"
function readError(line: string) {
  const match = line.match(/Failed to read JSON for ([^:]+): \S+: (.+?)['"]?,?$/);
  if (!match) return null;

  // Missing parent / misnamed file, another test says it better
  if (/ENOENT/.test(match[2])) return null;

  return `${match[1]}.json: Invalid JSON: ${match[2].replace(/\\'/g, "'")}`;
}

// Pulls one-line messages out of an actions log, dropping stack traces and other noise
export function parseLog(rawLines: string[]): Failure[] {
  const lines = rawLines.map((line) => line.replace(/^\S+Z /, "").replace(ANSI, ""));
  const failures: Failure[] = [];
  const template = templateFailure(lines);
  if (template) failures.push(template);

  const testNames = collectTestNames(lines);
  const testNameSet = new Set(testNames);

  const splitName = (rest: string): [string, string] => {
    const name = testNames.find((candidate) => rest.startsWith(candidate));
    return name ? [name, rest.slice(name.length).trim()] : [rest, ""];
  };

  const byTest = new Map<string, Set<string>>();
  const push = (test: string, message: string) => {
    const messages = byTest.get(test) ?? new Set<string>();
    if (message) messages.add(message);
    byTest.set(test, messages);
  };

  let currentTest = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const fail = line.match(/^✘\s*\[fail\]:\s*\w+ › (.+)$/);
    if (fail) {
      const [name, message] = splitName(fail[1]);
      push(name, /^Error thrown in test$/.test(message) ? "" : message);
      continue;
    }

    if (line.startsWith("##[error]")) {
      const message = line.replace("##[error]", "").trim();
      if (!/exit code|tests? failed/i.test(message)) push("error", message);
      continue;
    }

    // Detail block header: "group › name"
    const header = line.match(/^\w+ › (.+)$/);
    if (header && testNameSet.has(header[1])) {
      currentTest = header[1];
      continue;
    }

    const syntax = line.match(/Unhandled error: SyntaxError: (.+)$/);
    if (syntax) {
      push(currentTest || "All files should be valid JSON", `Invalid JSON: ${syntax[1]}`);
      continue;
    }

    if (!currentTest) continue;

    const jsonError = readError(line);
    if (jsonError) {
      push(currentTest, jsonError);
      continue;
    }

    if (NOT_FILE_MESSAGE.test(line)) continue;

    const isFileLine = FILE_MESSAGE.test(line)
      || /^JSON files should not be in the root directory$/.test(line);
    if (isFileLine) push(currentTest, line);
  }

  for (const [test, messages] of byTest) failures.push({ test, details: [...messages] });

  // A test that only crashed because of another failure has nothing to say
  const withDetails = failures.filter((failure) => failure.details.length);
  return withDetails.length ? withDetails : failures;
}

// Best matching reason label for what failed
export function reasonFor(failures: Failure[]): string | null {
  const all = failures
    .map((failure) => `${failure.test} ${failure.details.join(" ")}`)
    .join(" ")
    .toLowerCase();

  if (!all) return null;
  if (all.includes("pr template")) return "reason: incomplete pr";
  if (all.includes("not authorized") || all.includes("owned by the parent")) return "reason: unauthorized";

  if (/record|proxy|cname/.test(all)) {
    return /incompatible|combine|cname/.test(all)
      ? "reason: incompatible records"
      : "reason: invalid records";
  }

  if (/json|file name|root directory|fields/.test(all)) return "reason: invalid file";

  return null;
}

// Markdown list for the "tests failing" reply
export function failText(failures: Failure[]) {
  if (!failures.length) return "- the checks (see the details on the checks tab)";

  return failures
    .map((failure) => {
      const details = failure.details.filter((detail) => detail.toLowerCase() !== failure.test.toLowerCase());
      if (!details.length) return `- **${failure.test}**`;

      const bullets = details.map((detail) => `  - ${detail.replace(/`/g, "")}`).join("\n");
      return `- **${failure.test}**\n${bullets}`;
    })
    .join("\n");
}
