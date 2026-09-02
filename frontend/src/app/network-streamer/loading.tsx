export default function NetworkStreamerLoading() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-12">
      <div className="mx-auto max-w-6xl animate-pulse space-y-6">
        <div className="h-8 w-64 rounded bg-white/5" />
        <div className="h-4 w-96 rounded bg-white/5" />
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Stream panel skeleton */}
          <div className="lg:col-span-2 rounded-xl border border-white/5 bg-white/5 p-5 space-y-3 h-96">
            <div className="h-4 w-1/3 rounded bg-white/10" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-3 w-full rounded bg-white/5" />
            ))}
          </div>
          {/* Controls skeleton */}
          <div className="rounded-xl border border-white/5 bg-white/5 p-5 space-y-4">
            <div className="h-4 w-1/2 rounded bg-white/10" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 w-full rounded bg-white/5" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
