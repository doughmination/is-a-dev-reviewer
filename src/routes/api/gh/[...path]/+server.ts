/* routes/api/gh/[...path]/+server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { forwardToGithub } from "#lib/server/githubProxy.ts";
import type { RequestHandler } from "./$types";

// The token never reaches the browser: every GitHub call comes through here
const proxy: RequestHandler = ({ request, params, url, locals }) =>
  forwardToGithub(locals.session!, request, `/${params.path}`, url.search);

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
