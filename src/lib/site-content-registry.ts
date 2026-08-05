export type SiteContentFieldKind = "text" | "textarea" | "url";

export const SITE_CONTENT_PARAGRAPH_HELPER = "Line breaks and paragraph spacing are preserved when published.";

export type SiteContentFieldDefinition = {
  name: string;
  label: string;
  kind: SiteContentFieldKind;
  maxLength: number;
  required?: boolean;
  helper?: string;
};

export type SiteContentDefinition = {
  key: string;
  group: "Global" | "Homepage" | "Portfolio" | "Wedding landing" | "Client gallery";
  adminLabel: string;
  adminDescription: string;
  publicPath: string;
  fields: readonly SiteContentFieldDefinition[];
  defaults: Readonly<Record<string, string>>;
  supportsImage?: boolean;
  imageAspect?: "portrait" | "landscape";
};

const title = (label = "Title"): SiteContentFieldDefinition => ({ name: "title", label, kind: "text", maxLength: 220, required: true });
const subtitle = (label = "Subtitle / eyebrow"): SiteContentFieldDefinition => ({ name: "subtitle", label, kind: "text", maxLength: 220 });
const body = (label = "Paragraph"): SiteContentFieldDefinition => ({
  name: "body",
  label,
  kind: "textarea",
  maxLength: 3000,
  helper: SITE_CONTENT_PARAGRAPH_HELPER,
});
const ctaTitle = (label = "Call-to-action title"): SiteContentFieldDefinition => ({ name: "ctaTitle", label, kind: "text", maxLength: 220 });
const ctaBody = (label = "Call-to-action paragraph"): SiteContentFieldDefinition => ({
  name: "ctaBody",
  label,
  kind: "textarea",
  maxLength: 3000,
  helper: SITE_CONTENT_PARAGRAPH_HELPER,
});
const seoTitle: SiteContentFieldDefinition = { name: "seoTitle", label: "SEO title", kind: "text", maxLength: 70, helper: "Aim for 50–60 characters. The page title is used when this is empty." };
const seoDescription: SiteContentFieldDefinition = { name: "seoDescription", label: "SEO description", kind: "textarea", maxLength: 180, helper: "Aim for 120–160 characters. The main paragraph is used when this is empty." };

const categoryDefinitions = [
  ["weddings", "Weddings", "Wedding Photography", "Wedding stories crafted around authentic emotion, documentary rhythm, and elegant portraits.", "Book a wedding date", "Share the date, location, guest count, and the atmosphere you want preserved. The request lands in the same booking workflow used from the main page."],
  ["portraits", "Portraits", "Portrait Photography", "Portrait sessions and editorial stories with controlled lighting, natural direction, and careful retouching.", "", "Tell me who the portraits are for, the look you want, and whether you need studio, outdoor, or on-location coverage."],
  ["automotive", "Automotive", "Automotive Photography", "Automotive projects for brands, collectors, and dealerships with dramatic compositions and precise detail work.", "", "Share the vehicle, location, intended use, and any brand or campaign direction so we can shape the shoot around it."],
  ["landscapes", "Places", "Places Photography", "Travel, architecture, nature, and destination photography captured across memorable environments with print-ready finishing.", "", "Ask about prints, licensing, location-based commissions, or visual sets for editorial and interior projects."],
] as const;

export const siteContentRegistry = [
  {
    key: "global.brand", group: "Global", adminLabel: "Brand and default metadata",
    adminDescription: "Site name, tagline, and default search/share description.", publicPath: "/",
    fields: [title("Site name"), subtitle("Tagline"), body("Default SEO description"), seoTitle, seoDescription],
    defaults: { title: "Alex Bereanu", subtitle: "The elegance of being there", body: "Professional photography website with portfolio galleries, client delivery links, and direct booking workflows.", seoTitle: "", seoDescription: "" },
  },
  {
    key: "global.navigation", group: "Global", adminLabel: "Navigation labels",
    adminDescription: "Labels shared by desktop and mobile navigation. Destinations remain code-controlled for safety.", publicPath: "/",
    fields: [
      { name: "homeLabel", label: "Home", kind: "text", maxLength: 40, required: true },
      { name: "portfolioLabel", label: "Portfolio", kind: "text", maxLength: 40, required: true },
      { name: "aboutLabel", label: "About", kind: "text", maxLength: 40, required: true },
      { name: "connectLabel", label: "Connect", kind: "text", maxLength: 40, required: true },
      { name: "galleriesLabel", label: "Galleries", kind: "text", maxLength: 40, required: true },
      { name: "bookingLabel", label: "Bookings", kind: "text", maxLength: 40, required: true },
      ...categoryDefinitions.map(([slug, label]) => ({ name: `${slug}Label`, label: `${label} category`, kind: "text" as const, maxLength: 40, required: true })),
    ],
    defaults: { homeLabel: "Home", portfolioLabel: "Portfolio", aboutLabel: "About", connectLabel: "Connect", galleriesLabel: "Galleries", bookingLabel: "Bookings", weddingsLabel: "Weddings", portraitsLabel: "Portraits", automotiveLabel: "Automotive", landscapesLabel: "Places" },
  },
  {
    key: "global.footer", group: "Global", adminLabel: "Footer",
    adminDescription: "Brand line and optional supporting text shown in the footer.", publicPath: "/",
    fields: [title("Footer brand name"), subtitle("Footer tagline"), body("Supporting note")],
    defaults: { title: "Alex Bereanu", subtitle: "The elegance of being there", body: "" },
  },
  {
    key: "home.about", group: "Homepage", adminLabel: "Homepage — About",
    adminDescription: "About section below the homepage mosaic.", publicPath: "/",
    fields: [title(), body(), seoTitle, seoDescription], defaults: { title: "About Me", body: "I help clients preserve moments and present brands with sharp visual storytelling, calm communication, and detail-focused post-processing.", seoTitle: "", seoDescription: "" },
    supportsImage: true, imageAspect: "portrait",
  },
  {
    key: "home.contact", group: "Homepage", adminLabel: "Homepage — Connect",
    adminDescription: "Heading and introduction above the contact form.", publicPath: "/",
    fields: [title(), body()], defaults: { title: "Connect", body: "" },
  },
  {
    key: "social.instagram", group: "Global", adminLabel: "Instagram",
    adminDescription: "External Instagram destination used by the footer button.", publicPath: "/",
    fields: [title("Accessible label"), { name: "body", label: "Instagram URL", kind: "url", maxLength: 500 }], defaults: { title: "Open Instagram", body: "" },
  },
  {
    key: "portfolio.index", group: "Portfolio", adminLabel: "Portfolio overview",
    adminDescription: "Portfolio index heading, introduction, and metadata.", publicPath: "/portfolio",
    fields: [title(), body("Introduction"), seoTitle, seoDescription], defaults: { title: "Portfolio", body: "Curated galleries by category. Open any category for a responsive grid and lightbox preview.", seoTitle: "", seoDescription: "" },
  },
  ...categoryDefinitions.map(([slug, label, eyebrow, description, inquiryTitle, inquiryBody]) => ({
    key: `portfolio.${slug}`,
    group: "Portfolio" as const,
    adminLabel: `Portfolio — ${label}`,
    adminDescription: `Hero, inquiry copy, image, and metadata for /portfolio/${slug}.`,
    publicPath: `/portfolio/${slug}`,
    fields: [title(), subtitle(), body("Introduction"), ctaTitle("Inquiry title"), ctaBody("Inquiry paragraph"), seoTitle, seoDescription],
    defaults: { title: `${label} by Alex Bereanu`, subtitle: eyebrow, body: description, ctaTitle: inquiryTitle, ctaBody: inquiryBody, seoTitle: "", seoDescription: "" },
    supportsImage: true,
    imageAspect: "landscape" as const,
  })),
  {
    key: "weddings.landing", group: "Wedding landing", adminLabel: "Wedding landing page",
    adminDescription: "Standalone /weddings heading, introduction, reserved-section copy, and CTA.", publicPath: "/weddings",
    fields: [title(), subtitle("Section heading"), body("Introduction"), ctaTitle("CTA label"), ctaBody("Reserved-section paragraph"), seoTitle, seoDescription],
    defaults: { title: "Weddings by Alex Bereanu", subtitle: "Wedding collections", body: "A dedicated presentation route for wedding collections, stories, and planning guidance.", ctaTitle: "View Wedding Portfolio", ctaBody: "This page is reserved for a focused wedding presentation. Portfolio galleries and booking requests remain available from the wedding portfolio page.", seoTitle: "", seoDescription: "" },
  },
  {
    key: "client.gallery", group: "Client gallery", adminLabel: "Private client gallery",
    adminDescription: "Client-facing introduction, save guidance, labels, and empty state. Security errors remain code-controlled.", publicPath: "/g/[private-link]",
    fields: [title("Gallery eyebrow"), subtitle("Save action label"), body("Client introduction"), ctaTitle("Download fallback label"), ctaBody("Phone save instructions"), { name: "emptyState", label: "Empty gallery message", kind: "textarea", maxLength: 500 }],
    defaults: { title: "Private client gallery", subtitle: "Save full-quality photo", body: "Your private collection is ready to view.", ctaTitle: "Download original", ctaBody: "Use the save or share action for one photo at a time. Your phone decides whether the image is stored in Photos or Downloads.", emptyState: "No ready photos are available in this gallery yet." },
  },
] as const satisfies readonly SiteContentDefinition[];

export type SiteContentDocumentKey = (typeof siteContentRegistry)[number]["key"];

const definitionsByKey = new Map<string, SiteContentDefinition>(siteContentRegistry.map((definition) => [definition.key, definition]));

export function isSiteContentDocumentKey(value: string): value is SiteContentDocumentKey {
  return definitionsByKey.has(value);
}

export function getSiteContentDefinition(key: SiteContentDocumentKey): SiteContentDefinition {
  const definition = definitionsByKey.get(key);
  if (!definition) throw new Error("Unknown site content key.");
  return definition;
}

export function normalizeSiteContentPayload(key: SiteContentDocumentKey, input: Record<string, unknown>): Record<string, string> {
  const definition = getSiteContentDefinition(key);
  const output: Record<string, string> = {};

  for (const field of definition.fields) {
    const raw = input[field.name];
    if (typeof raw !== "string") throw new Error(`Missing ${field.name}.`);
    const value = raw.trim();
    if (field.required && !value) throw new Error(`${field.label} is required.`);
    if (value.length > field.maxLength) throw new Error(`${field.label} is too long.`);
    if (field.kind === "url" && value) {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${field.label} must use HTTP or HTTPS.`);
      output[field.name] = url.toString();
    } else {
      output[field.name] = value;
    }
  }

  return output;
}

export function mergeSiteContentPayload(key: SiteContentDocumentKey, payload?: unknown): Record<string, string> {
  const definition = getSiteContentDefinition(key);
  const row = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  return Object.fromEntries(definition.fields.map((field) => {
    const current = row[field.name];
    return [field.name, typeof current === "string" ? current : definition.defaults[field.name] ?? ""];
  }));
}
