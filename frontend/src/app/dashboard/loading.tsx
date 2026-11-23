import { CardSkeleton, ChartSkeleton } from '@/components/common/Skeleton';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-black pb-16 text-white">
      <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-6 xl:flex-row">
          <div className="flex-1 rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-xl">
            <div className="mb-4 h-4 w-32 animate-pulse rounded bg-white/5" />
            <div className="mb-6 h-10 w-64 animate-pulse rounded bg-white/5" />
            <div className="h-4 w-full animate-pulse rounded bg-white/5" />
          </div>

          <div className="w-full xl:w-[360px]">
            <CardSkeleton />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ChartSkeleton />
          </div>
          <div>
            <CardSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
