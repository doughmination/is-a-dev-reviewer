/* routes/(app)/+layout.server.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { LayoutServerLoad } from "./$types";

// hooks.server.ts already made sure there's a linked, allowed session
export const load: LayoutServerLoad = ({ locals }) => {
  const github = locals.session!.github!;

  return {
    user: {
      login: github.login,
      avatar: github.avatar,
      name: github.name,
    },
    canReviewBot: !!locals.session!.access?.bot,
  };
};
