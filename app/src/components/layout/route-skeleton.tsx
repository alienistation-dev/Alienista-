export function RouteSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-6" aria-hidden="true">
    <div className="space-y-2"><div className="h-7 w-48 animate-pulse rounded-lg bg-slate-200" /><div className="h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" /></div>
    <div className="rounded-2xl border border-[#E5EBE5] bg-white p-4 sm:p-5"><div className="mb-5 h-10 w-full animate-pulse rounded-xl bg-slate-100" /><div className="space-y-3">{Array.from({ length: rows }, (_, index) => <div key={index} className="h-14 w-full animate-pulse rounded-xl bg-slate-100" />)}</div></div>
  </div>;
}

export function DashboardSkeleton() { return <RouteSkeleton rows={5} />; }
