/* lib/client/settings.svelte.ts
 * MIT Licence — (c) Clove Twilight
 */

import { DEFAULT_CANNED, type Canned } from "#lib/core/canned.ts";
import { readStored, writeStored } from "./storage.ts";

export type Settings = {
  extraQuery: string;
  skipLabels: string[];
  skipReviewed: boolean;
  hideCi: boolean;
  canned: Canned[];
};

const DEFAULTS: Settings = {
  extraQuery: "",
  skipLabels: ["r: william", "report-abuse"],
  skipReviewed: true,
  hideCi: true,
  canned: DEFAULT_CANNED,
};

export const settings = $state<Settings>(readStored("settings", DEFAULTS));

export function saveSettings() {
  writeStored("settings", $state.snapshot(settings));
}
