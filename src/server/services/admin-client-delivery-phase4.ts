import "server-only";

import { env } from "@/config/env";

export function isAdminClientDeliveryPhase4Enabled(): boolean {
  return env.ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED === true && env.ADMIN_GALLERY_PHASE2_ENABLED === true;
}

export function requireAdminClientDeliveryPhase4(): void {
  if (!isAdminClientDeliveryPhase4Enabled()) {
    throw new Error("Admin client delivery Phase 4 is disabled.");
  }
}
