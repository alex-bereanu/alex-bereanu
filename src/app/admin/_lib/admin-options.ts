import { GalleryCategory, TicketStatus } from "@/generated/prisma/client";

export const noticeLabels: Record<string, string> = {
  gallery_created: "Gallery created.",
  gallery_updated: "Gallery updated.",
  gallery_deleted: "Gallery deleted.",
  share_link_created: "Custom gallery link generated.",
  share_link_revoked: "Gallery share link revoked immediately.",
  ticket_status_updated: "Ticket status updated.",
  ticket_reply_sent: "Ticket response processed.",
  asset_deleted: "Asset removed from gallery metadata.",
  archive_deleted: "Gallery ZIP archive removed; storage cleanup is recorded and will retry if needed.",
  site_content_updated: "Site text and image content updated.",
  storage_deletions_retried: "Pending storage deletions were retried.",
  media_jobs_processed: "The media processing queue was run.",
  media_job_retried: "The failed media job was queued for another attempt.",
};

export const errorLabels: Record<string, string> = {
  database_not_configured: "DATABASE_URL is not configured.",
  invalid_gallery_payload: "Invalid gallery payload.",
  gallery_create_failed: "Unable to create gallery.",
  gallery_update_failed: "Unable to update gallery.",
  gallery_delete_failed: "Unable to delete gallery.",
  gallery_not_found: "Gallery not found.",
  invalid_share_link_payload: "Invalid share link payload.",
  share_link_create_failed: "Unable to generate share link.",
  share_link_revoke_failed: "Unable to revoke share link.",
  share_link_not_found: "Active share link not found.",
  invalid_ticket_status_payload: "Invalid ticket status payload.",
  ticket_status_update_failed: "Unable to update ticket status.",
  invalid_ticket_reply_payload: "Invalid ticket reply payload.",
  ticket_reply_failed: "Unable to process ticket reply.",
  ticket_not_found: "Ticket not found.",
  invalid_asset_delete_payload: "Invalid asset delete payload.",
  asset_delete_failed: "Unable to delete asset.",
  invalid_archive_delete_payload: "Invalid archive delete payload.",
  archive_delete_failed: "Unable to delete archive.",
  invalid_site_content_payload: "Invalid site content payload.",
  site_content_update_failed: "Unable to update site content.",
  invalid_storage_deletion_retry: "Invalid storage deletion retry request.",
  storage_deletion_retry_failed: "Unable to retry pending storage deletions.",
  invalid_media_job_request: "Invalid media processing request.",
  media_job_run_failed: "Unable to run the media processing queue.",
  media_job_retry_failed: "Unable to retry the media job.",
  media_job_not_retryable: "That media job is not currently retryable.",
  gallery_visibility_storage_migration_required:
    "Move or remove gallery files before changing visibility; public and private galleries use separate storage.",
};

export const categoryLabels: Record<GalleryCategory, string> = {
  PORTRAITS: "Portraits",
  AUTOMOTIVE: "Automotive",
  LANDSCAPES: "Places",
  WEDDINGS: "Weddings",
  PRODUCT: "Product",
  CORPORATE: "Corporate",
  CUSTOM: "Custom",
};

export function resolveTicketStatusFilter(value: string | undefined): TicketStatus | "ALL" {
  if (!value || value === "ALL") {
    return "ALL";
  }

  if (Object.values(TicketStatus).includes(value as TicketStatus)) {
    return value as TicketStatus;
  }

  return "ALL";
}

export function resolveCreateCategory(value: string | undefined): GalleryCategory {
  if (!value) {
    return GalleryCategory.PORTRAITS;
  }

  if (Object.values(GalleryCategory).includes(value as GalleryCategory)) {
    return value as GalleryCategory;
  }

  return GalleryCategory.PORTRAITS;
}
