export default function ChainReorgLoading() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-12">
      <div className="mx-auto max-w-4xl animate-pulse space-y-6">
        <div className="h-8 w-52 rounded bg-white/5" />
        <div className="h-4 w-80 rounded bg-white/5" />
        {/* Canvas skeleton */}
        <div className="rounded-xl border border-white/5 bg-white/5 h-72 w-full" />
        <div className="flex gap-3">
          <div className="h-9 w-24 rounded bg-white/5" />
          <div className="h-9 w-24 rounded bg-white/5" />
        </div>
      </div>
    </div>
  );
}
