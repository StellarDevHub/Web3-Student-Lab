export default function YieldCalculatorLoading() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-12">
      <div className="mx-auto max-w-4xl animate-pulse space-y-6">
        <div className="h-8 w-52 rounded bg-white/5" />
        <div className="h-4 w-80 rounded bg-white/5" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-white/5 bg-white/5 p-5 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-1/3 rounded bg-white/10" />
                <div className="h-8 w-full rounded bg-white/5" />
              </div>
            ))}
          </div>
          {/* Chart skeleton */}
          <div className="rounded-xl border border-white/5 bg-white/5 p-5 h-64" />
        </div>
      </div>
    </div>
  );
}
