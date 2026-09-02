export default function MempoolAuctionLoading() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-12">
      <div className="mx-auto max-w-6xl animate-pulse space-y-6">
        <div className="h-8 w-56 rounded bg-white/5" />
        <div className="h-4 w-80 rounded bg-white/5" />
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-5 space-y-3 h-40">
              <div className="h-4 w-1/2 rounded bg-white/10" />
              <div className="h-3 w-full rounded bg-white/5" />
              <div className="h-3 w-4/5 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
