export default function BlogLoading() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-12">
      <div className="mx-auto max-w-5xl animate-pulse space-y-6">
        {/* Header skeleton */}
        <div className="space-y-3">
          <div className="h-8 w-48 rounded bg-white/5" />
          <div className="h-4 w-72 rounded bg-white/5" />
        </div>
        {/* Card grid skeleton */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-5 space-y-3">
              <div className="h-4 w-3/4 rounded bg-white/10" />
              <div className="h-3 w-full rounded bg-white/5" />
              <div className="h-3 w-5/6 rounded bg-white/5" />
              <div className="h-3 w-1/2 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
