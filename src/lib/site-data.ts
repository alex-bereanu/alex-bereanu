export type PortfolioCategory = {
  slug: "portraits" | "automotive" | "landscapes" | "weddings" | "product" | "corporate";
  title: string;
  description: string;
};

export const portfolioCategories: PortfolioCategory[] = [
  {
    slug: "portraits",
    title: "Portraits",
    description: "Natural and editorial portrait sessions with studio-grade retouching.",
  },
  {
    slug: "automotive",
    title: "Automotive",
    description: "Dynamic automotive visuals for private owners, dealerships, and brands.",
  },
  {
    slug: "landscapes",
    title: "Places",
    description: "Travel, architecture, nature, and destination photography in print-ready quality.",
  },
  {
    slug: "weddings",
    title: "Weddings",
    description: "Documentary + editorial wedding coverage with timeless post-processing.",
  },
  {
    slug: "product",
    title: "Product",
    description: "Catalog and campaign product imagery with controlled lighting setups.",
  },
  {
    slug: "corporate",
    title: "Corporate",
    description: "Business portraits, events, and brand storytelling for company teams.",
  },
];

export const navigationItems = [
  { href: "/", label: "Home" },
  { href: "#portfolio", label: "Portfolio" },
  { href: "#about", label: "About Me" },
  { href: "#contact", label: "Connect" },
] as const;

export const headerCategoryLinks = [
  { href: "/portfolio/weddings", label: "Weddings" },
  { href: "/portfolio/portraits", label: "Portraits" },
  { href: "/portfolio/automotive", label: "Automotive" },
  { href: "/portfolio/landscapes", label: "Places" },
] as const;
