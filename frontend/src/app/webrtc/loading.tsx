export default function WebRTCLoading() {
  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-12">
      <div className="mx-auto max-w-6xl animate-pulse space-y-6">
        <div className="h-8 w-40 rounded bg-white/5" />
        <div className="h-4 w-72 rounded bg-white/5" />
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 h-12 w-full" />
        {/* Video grid skeleton */}
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-slate-900 aspect-video w-full" />
          ))}
        </div>
        <div className="flex gap-3 justify-center">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 w-10 rounded-full bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
