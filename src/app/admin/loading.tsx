export default function AdminLoading() {
  return (
    <div className="admin-shell">
      <div className="admin-workspace">
        <main className="admin-main" aria-busy="true" aria-label="Loading admin workspace">
          <div className="h-28 animate-pulse rounded bg-neutral-200" />
          <div className="admin-metrics">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded border border-neutral-200 bg-white" />)}
          </div>
          <div className="h-80 animate-pulse rounded border border-neutral-200 bg-white" />
          <span className="sr-only">Loading admin workspace</span>
        </main>
      </div>
    </div>
  );
}
