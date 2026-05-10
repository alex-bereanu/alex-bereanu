import type { Metadata } from "next";

import { CategoryLandingPage } from "@/components/category-landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corporate Photography",
  description: "Corporate galleries and connect requests for Alex Bereanu Photography.",
};

export default async function CorporatePage() {
  return (
    <CategoryLandingPage
      categorySlug="corporate"
      eyebrow="Corporate Photography"
      title="Corporate by Alex Bereanu"
      description="Corporate portraits, team sessions, and event coverage shaped around brand guidelines and practical delivery needs."
      inquiryDescription="Share the team size, location, schedule, and how the images will be used so the coverage can stay efficient."
    />
  );
}
