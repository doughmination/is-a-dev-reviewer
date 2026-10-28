/* routes/api/music/[name]/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { env } from "cloudflare:workers";
import { deleteMusic, storeMusic, streamMusic } from "#lib/server/music.ts";
import type { RequestHandler } from "./$types";

// Streams with Range support so the player can seek
export const GET: RequestHandler = ({ locals, params, request }) =>
  streamMusic(env.MUSIC, locals.session!.github!.id, params.name, request.headers.get("range"));

export const PUT: RequestHandler = ({ locals, params, request }) =>
  storeMusic(env.MUSIC, locals.session!.github!.id, params.name, request);

export const DELETE: RequestHandler = ({ locals, params }) =>
  deleteMusic(env.MUSIC, locals.session!.github!.id, params.name);
