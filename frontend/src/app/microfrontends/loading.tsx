export default function MicrofrontendsLoading() {
  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-12">
      <div className="mx-auto max-w-6xl animate-pulse space-y-6">
        <div className="h-8 w-56 rounded bg-white/5" />
        <div className="h-4 w-96 rounded bg-white/5" />
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 h-12 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-5 space-y-3 h-32">
              <div className="h-4 w-1/2 rounded bg-white/10" />
              <div className="h-3 w-full rounded bg-white/5" />
              <div className="h-3 w-3/4 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
