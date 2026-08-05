import Link from "next/link";
import { GalleryCategory, GalleryVisibility } from "@/generated/prisma/client";

import { AdminAlerts, AdminShell } from "@/app/admin/_components/admin-chrome";
import { categoryLabels, resolveCreateCategory } from "@/app/admin/_lib/admin-options";
import { AdminGalleryCreateForm } from "@/components/admin-gallery-create-form";
import { env } from "@/config/env";
import { requireAdminPageSession } from "@/server/auth/admin-guard";
import { createCsrfToken } from "@/server/security/request-protection";
import { isAdminGalleryPhase2Enabled } from "@/server/services/admin-gallery-phase2";

type NewGalleryPageProps = {
  searchParams: Promise<{ notice?: string; error?: string; category?: string }>;
};

export const dynamic = "force-dynamic";

export default async function NewGalleryPage({ searchParams }: NewGalleryPageProps) {
  await requireAdminPageSession("/admin/galleries/new");
  const params = await searchParams;
  const csrfToken = createCsrfToken();
  const categoryOptions = Object.values(GalleryCategory);
  const phase2 = isAdminGalleryPhase2Enabled();

  return (
    <AdminShell
      active="galleries"
      eyebrow="Galleries / New"
      title="Create gallery"
      description="Start with the collection details. After creation, you’ll continue directly to its photo workspace."
      csrfToken={csrfToken}
      actions={<Link className="admin-secondary-button" href="/admin/galleries">Cancel</Link>}
    >
      <AdminAlerts error={params.error} notice={params.notice} />
      {!env.DATABASE_URL ? (
        <p className="admin-alert admin-alert-warning">DATABASE_URL is not configured.</p>
      ) : (
        <section className="admin-panel max-w-3xl">
          <div className="admin-panel-header"><div><h2>Collection details</h2><p className="admin-panel-copy">The URL slug appears in the public or private gallery address. {phase2 ? "New galleries start as Draft and stay hidden until their photos are ready and you publish them." : "The Phase 2 draft lifecycle remains disabled until its migration gate passes."}</p></div></div>
          <AdminGalleryCreateForm
            categoryLabels={categoryLabels}
            categoryOptions={categoryOptions}
            csrfToken={csrfToken}
            initialCategory={resolveCreateCategory(params.category)}
            mainCategoryOptions={categoryOptions.filter((category) => category !== GalleryCategory.CUSTOM)}
            visibilityOptions={Object.values(GalleryVisibility)}
          />
        </section>
      )}
    </AdminShell>
  );
}
