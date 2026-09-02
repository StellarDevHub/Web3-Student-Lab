export default function ForumLoading() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-12">
      <div className="mx-auto max-w-4xl animate-pulse space-y-6">
        <div className="h-8 w-40 rounded bg-white/5" />
        <div className="h-4 w-64 rounded bg-white/5" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-white/10" />
              <div className="h-4 w-1/3 rounded bg-white/10" />
            </div>
            <div className="h-3 w-full rounded bg-white/5" />
            <div className="h-3 w-5/6 rounded bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
