import "server-only";

import { env } from "@/config/env";

/**
 * Final compatibility retirement is intentionally dependent on every
 * schema-backed Admin phase. Enabling Phase 6 alone must never expose code
 * that expects an unapplied migration.
 */
export function isAdminPhase6ReleaseEnabled(): boolean {
  return (
    env.ADMIN_PHASE6_RELEASE_ENABLED === true &&
    env.ADMIN_GALLERY_PHASE2_ENABLED === true &&
    env.ADMIN_CONTENT_PHASE3_ENABLED === true &&
    env.ADMIN_CLIENT_DELIVERY_PHASE4_ENABLED === true
  );
}
