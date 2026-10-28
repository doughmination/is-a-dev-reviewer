/* lib/server/jobLog.ts
 * MIT Licence — (c) Clove Twilight
 */

const KEEP_LINES = 600;
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
// "2026-10-24T12:00:00.1234567Z message"
const TIMESTAMP = /^\d{4}-\d\d-\d\dT\S+Z /;

// Actions logs redirect to blob storage with no CORS, so the worker fetches them
export async function jobLog(token: string, repo: string, job: number): Promise<string[]> {
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${job}/logs`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "clove-reviewer",
    },
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const lines = (await response.text())
    .split("\n")
    .map((line) => line.replace(ANSI, "").replace(TIMESTAMP, ""));

  return lines.slice(-KEEP_LINES);
}
