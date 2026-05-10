export default function PublicGalleryLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto h-24 w-full max-w-6xl rounded bg-neutral-100" />
      <section className="mx-auto w-full max-w-4xl space-y-3 text-center">
        <div className="mx-auto h-3 w-28 rounded bg-neutral-200" />
        <div className="mx-auto h-14 w-2/3 rounded bg-neutral-100" />
        <div className="mx-auto h-4 w-1/2 rounded bg-neutral-100" />
      </section>
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="aspect-[4/5] rounded bg-neutral-100" />
        ))}
      </div>
    </main>
  );
}
