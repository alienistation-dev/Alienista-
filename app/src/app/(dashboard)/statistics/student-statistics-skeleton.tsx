export function StudentStatisticsSkeleton() {
  return (
    <section className="p-5 bg-white border border-[#E5EBE5] rounded-3xl space-y-4" aria-label="Loading student attendance records" aria-busy="true">
      <div className="h-5 w-64 animate-pulse rounded bg-slate-200" />
      <div className="border border-[#E5EBE5] rounded-2xl overflow-hidden">
        <div className="h-10 animate-pulse bg-slate-100" />
        <div className="divide-y divide-[#E5EBE5]">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-11 animate-pulse bg-slate-50" />)}</div>
      </div>
    </section>
  );
}
