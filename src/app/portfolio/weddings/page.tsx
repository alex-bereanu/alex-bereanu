import type { Metadata } from "next";

import { CategoryLandingPage } from "@/components/category-landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wedding Photography",
  description: "Wedding galleries and booking requests for Alex Bereanu Photography.",
};

export default async function WeddingsCategoryPage() {
  return (
    <CategoryLandingPage
      categorySlug="weddings"
      eyebrow="Wedding Photography"
      title="Weddings by Alex Bereanu"
      description="Wedding stories crafted around authentic emotion, documentary rhythm, and elegant portraits."
      inquiryType="booking"
      inquiryTitle="Book a wedding date"
      inquiryDescription="Share the date, location, guest count, and the atmosphere you want preserved. The request lands in the same booking workflow used from the main page."
      showcaseOnly
      showGalleriesAfterMosaic
    />
  );
}
