import "server-only";

import { env } from "@/config/env";

export function isAdminContentPhase3Enabled(): boolean {
  return env.ADMIN_CONTENT_PHASE3_ENABLED === true;
}
