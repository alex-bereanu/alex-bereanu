import type { Metadata } from "next";

import { CategoryLandingPage } from "@/components/category-landing-page";
import { buildSiteContentMetadata, getSiteContent } from "@/server/services/site-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> { return buildSiteContentMetadata(await getSiteContent("portfolio.portraits"), "/portfolio/portraits"); }

export default async function PortraitsPage() {
  return (
    <CategoryLandingPage
      categorySlug="portraits"
      eyebrow="Portrait Photography"
      title="Portraits by Alex Bereanu"
      description="Portrait sessions and editorial stories with controlled lighting, natural direction, and careful retouching."
      inquiryDescription="Tell me who the portraits are for, the look you want, and whether you need studio, outdoor, or on-location coverage."
      showcaseOnly
    />
  );
}
