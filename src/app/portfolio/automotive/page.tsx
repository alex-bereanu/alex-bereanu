import type { Metadata } from "next";

import { CategoryLandingPage } from "@/components/category-landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Automotive Photography",
  description: "Automotive galleries and connect requests for Alex Bereanu Photography.",
};

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
