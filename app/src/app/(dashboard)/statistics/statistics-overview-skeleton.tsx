export function StatisticsOverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" aria-label="Loading statistics overview" aria-busy="true">
      {Array.from({ length: 2 }, (_, card) => (
        <section key={card} className="p-5 bg-white border border-[#E5EBE5] rounded-3xl space-y-4">
          <div className="h-5 w-52 animate-pulse rounded bg-slate-200" />
          <div className="space-y-3">{Array.from({ length: 4 }, (_, row) => <div key={row} className="h-9 animate-pulse rounded-xl bg-slate-100" />)}</div>
        </section>
      ))}
    </div>
  );
}
