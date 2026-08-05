import type { Metadata } from "next";

import { CategoryLandingPage } from "@/components/category-landing-page";
import { buildSiteContentMetadata, getSiteContent } from "@/server/services/site-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> { return buildSiteContentMetadata(await getSiteContent("portfolio.automotive"), "/portfolio/automotive"); }

export default async function AutomotivePage() {
  return (
    <CategoryLandingPage
      categorySlug="automotive"
      eyebrow="Automotive Photography"
      title="Automotive by Alex Bereanu"
      description="Automotive projects for brands, collectors, and dealerships with dramatic compositions and precise detail work."
      inquiryDescription="Share the vehicle, location, intended use, and any brand or campaign direction so we can shape the shoot around it."
      showcaseOnly
    />
  );
}
