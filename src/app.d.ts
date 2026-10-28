/* app.d.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { Session } from "#lib/server/session.ts";

declare global {
  namespace App {
    // Bindings come from `import { env } from "cloudflare:workers"`, typed in worker-configuration.d.ts
    interface Locals {
      sessionId: string | null;
      session: Session | null;
    }
  }
}

export {};
