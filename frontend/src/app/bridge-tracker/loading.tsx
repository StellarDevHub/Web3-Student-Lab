export default function BridgeTrackerLoading() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-12">
      <div className="mx-auto max-w-5xl animate-pulse space-y-6">
        <div className="h-8 w-56 rounded bg-white/5" />
        <div className="h-4 w-80 rounded bg-white/5" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-5 space-y-3">
              <div className="h-5 w-1/2 rounded bg-white/10" />
              <div className="h-3 w-full rounded bg-white/5" />
              <div className="h-3 w-4/5 rounded bg-white/5" />
              <div className="h-6 w-24 rounded-full bg-amber-500/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
