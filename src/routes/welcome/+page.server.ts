/* routes/welcome/+page.server.ts
 * MIT Licence — (c) Clove Twilight
 */

import { redirect } from "@sveltejs/kit";

import { safeReturnTo } from "#lib/server/session.ts";
import type { PageServerLoad } from "./$types";

// Already signed in: skip straight to where they were going
export const load: PageServerLoad = ({ url, locals }) => {
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  if (locals.session?.github && locals.session.access?.register) redirect(303, returnTo);

  return { returnTo };
};
