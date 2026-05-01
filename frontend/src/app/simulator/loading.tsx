import React from "react";
import { CardSkeleton, ChartSkeleton } from "@/components/common/Skeleton";

export default function SimulatorLoading() {
  return (
    <div className="min-h-[calc(100vh-80px)] bg-black text-white p-6 md:p-12 font-mono">
      <div className="max-w-7xl mx-auto flex flex-col h-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6">
          <div className="border-l-4 border-zinc-800 pl-6">
            <div className="h-10 w-64 bg-white/5 animate-pulse rounded mb-2" />
            <div className="h-4 w-48 bg-white/5 animate-pulse rounded" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-10 w-32 bg-white/5 animate-pulse rounded" />
            <div className="h-10 w-32 bg-white/5 animate-pulse rounded" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 flex-grow">
          <div className="lg:col-span-1">
            <CardSkeleton />
          </div>
          <div className="lg:col-span-2">
            <ChartSkeleton />
          </div>
          <div className="lg:col-span-1">
            <CardSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
