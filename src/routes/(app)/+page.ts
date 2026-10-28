/* routes/(app)/+page.ts
 * MIT Licence — (c) Clove Twilight
 */

import { redirect } from "@sveltejs/kit";

export const load = () => {
  redirect(307, "/register");
};
