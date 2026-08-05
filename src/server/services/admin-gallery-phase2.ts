import "server-only";

import { env } from "@/config/env";

export const DEFAULT_GALLERY_RECYCLE_RETENTION_DAYS = 30;

export function isAdminGalleryPhase2Enabled(): boolean {
  return env.ADMIN_GALLERY_PHASE2_ENABLED === true;
}

export function getGalleryRecycleRetentionDays(): number {
  return Math.min(env.GALLERY_RECYCLE_RETENTION_DAYS ?? DEFAULT_GALLERY_RECYCLE_RETENTION_DAYS, 365);
}
