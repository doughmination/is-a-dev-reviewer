/* routes/api/music/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { env } from "cloudflare:workers";
import { json } from "@sveltejs/kit";

import { listMusic } from "#lib/server/music.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) =>
  json(await listMusic(env.MUSIC, locals.session!.github!.id));
