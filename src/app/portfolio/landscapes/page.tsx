import type { Metadata } from "next";

import { CategoryLandingPage } from "@/components/category-landing-page";
import { buildSiteContentMetadata, getSiteContent } from "@/server/services/site-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> { return buildSiteContentMetadata(await getSiteContent("portfolio.landscapes"), "/portfolio/landscapes"); }

export default async function LandscapesPage() {
  return (
    <CategoryLandingPage
      categorySlug="landscapes"
      eyebrow="Places Photography"
      title="Places by Alex Bereanu"
      description="Travel, architecture, nature, and destination photography captured across memorable environments with print-ready finishing."
      inquiryDescription="Ask about prints, licensing, location-based commissions, or visual sets for editorial and interior projects."
      showcaseOnly
    />
  );
}
