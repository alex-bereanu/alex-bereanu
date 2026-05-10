import type { Metadata } from "next";

import { CategoryLandingPage } from "@/components/category-landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Places Photography",
  description: "Places galleries and connect requests for Alex Bereanu Photography.",
};

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
