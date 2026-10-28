/* routes/(app)/[tab=profile]/+page.ts
 * MIT Licence — (c) Clove Twilight
 */

import { redirect } from "@sveltejs/kit";

import type { ProfileId } from "#lib/core/profiles.ts";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params, parent }) => {
  const { canReviewBot } = await parent();
  if (params.tab === "bot" && !canReviewBot) redirect(307, "/register");

  return { tab: params.tab as ProfileId };
};
