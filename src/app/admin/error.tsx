"use client";

export default function AdminError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <main className="admin-shell flex min-h-screen items-center justify-center p-6">
      <section className="admin-panel max-w-xl">
        <p className="admin-eyebrow">Admin unavailable</p>
        <h1 className="mt-2 font-serif text-3xl">This view could not be loaded</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">Your data was not changed. Try loading the view again; if the problem continues, review the Operations page and server logs.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="admin-primary-button" type="button" onClick={() => unstable_retry()}>Try again</button>
          <a className="admin-secondary-button" href="/admin">Dashboard</a>
        </div>
      </section>
    </main>
  );
}
