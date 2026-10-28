/* params.ts
 * MIT Licence — (c) Clove Twilight
 */

import { defineParams } from "@sveltejs/kit/params";

import { isProfileId } from "#lib/core/profiles.ts";

// [tab=profile] only matches the two review tabs
export const params = defineParams({
  profile: (value) => (isProfileId(value) ? value : undefined),
});
