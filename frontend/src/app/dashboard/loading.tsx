import { CardSkeleton, ChartSkeleton } from "@/components/common/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-black text-white pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="flex flex-col xl:flex-row gap-6 mb-8">
          <div className="flex-1 rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-xl">
            <div className="h-4 w-32 bg-white/5 animate-pulse rounded mb-4" />
            <div className="h-10 w-64 bg-white/5 animate-pulse rounded mb-6" />
            <div className="h-4 w-full bg-white/5 animate-pulse rounded" />
          </div>
          
          <div className="w-full xl:w-[360px]">
            <CardSkeleton />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
