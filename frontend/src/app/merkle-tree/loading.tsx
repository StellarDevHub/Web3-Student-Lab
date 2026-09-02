export default function MerkleTreeLoading() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-12">
      <div className="mx-auto max-w-5xl animate-pulse space-y-6">
        <div className="h-8 w-48 rounded bg-white/5" />
        <div className="h-4 w-72 rounded bg-white/5" />
        {/* Tree visualiser skeleton */}
        <div className="rounded-xl border border-white/5 bg-white/5 p-6 h-80 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="h-8 w-20 rounded bg-white/10" />
            <div className="flex gap-8">
              <div className="h-8 w-16 rounded bg-white/10" />
              <div className="h-8 w-16 rounded bg-white/10" />
            </div>
            <div className="flex gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 w-14 rounded bg-white/10" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
