/* routes/api/joblog/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { error, json } from "@sveltejs/kit";

import { PROFILES } from "#lib/core/profiles.ts";
import { jobLog } from "#lib/server/jobLog.ts";
import type { RequestHandler } from "./$types";

const REPOS = new Set(Object.values(PROFILES).map((profile) => profile.repo));

export const GET: RequestHandler = async ({ url, locals }) => {
  const repo = url.searchParams.get("repo") ?? "";
  const job = Number(url.searchParams.get("job"));
  if (!REPOS.has(repo) || !job) error(400, "bad repo or job");

  try {
    return json(await jobLog(locals.session!.github!.token, repo, job));
  } catch (cause) {
    error(502, `job log: ${cause instanceof Error ? cause.message : cause}`);
  }
};
