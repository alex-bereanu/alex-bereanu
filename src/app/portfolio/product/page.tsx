import type { Metadata } from "next";

import { CategoryLandingPage } from "@/components/category-landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Product Photography",
  description: "Product galleries and connect requests for Alex Bereanu Photography.",
};

export default async function ProductPage() {
  return (
    <CategoryLandingPage
      categorySlug="product"
      eyebrow="Product Photography"
      title="Product by Alex Bereanu"
      description="Commercial product visuals for ecommerce catalogs, launch campaigns, and ad creative with controlled lighting."
      inquiryDescription="Send the product type, quantity, usage needs, and deadline so I can recommend a clean production plan."
    />
  );
}
