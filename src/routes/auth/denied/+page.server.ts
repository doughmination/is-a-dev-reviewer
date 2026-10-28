/* routes/auth/denied/+page.server.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => ({
  login: locals.session?.github?.login ?? null,
});
