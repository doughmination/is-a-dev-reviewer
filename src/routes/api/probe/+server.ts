/* routes/api/probe/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { error, json } from "@sveltejs/kit";

import { probeSite } from "#lib/server/probe.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const target = url.searchParams.get("url") ?? "";
  if (!/^https?:\/\//.test(target)) error(400, "bad url");

  return json(await probeSite(target));
};
