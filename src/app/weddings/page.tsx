import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { headerCategoryLinks } from "@/lib/site-data";

export default function WeddingsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <SiteHeader
        className="rounded p-4 backdrop-blur"
        links={[
          { href: "/", label: "Home" },
          ...headerCategoryLinks,
          { href: "/portfolio/weddings", label: "Weddings Portfolio" },
        ]}
      />

      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Dedicated Weddings Site</p>
        <h1 className="editorial-heading text-5xl">Weddings by Alex Bereanu</h1>
        <p className="max-w-2xl text-sm text-neutral-700">
          This is the separate one-page experience for the weddings domain. Detailed layout and content will be added in
          the dedicated UI phase.
        </p>
      </header>

      <section className="rounded-lg bg-neutral-50 p-8 shadow-[0_12px_30px_rgba(23,18,15,0.06)]">
        <p className="text-sm text-neutral-700">Reserved for the full weddings microsite sections and CTA flow.</p>
      </section>

      <SiteFooter links={[{ href: "/portfolio/weddings", label: "Weddings" }]} />
    </main>
  );
}
