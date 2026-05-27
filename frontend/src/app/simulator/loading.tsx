import React from 'react';
import { CardSkeleton, ChartSkeleton } from '@/components/common/Skeleton';

export default function SimulatorLoading() {
  return (
    <div className="min-h-[calc(100vh-80px)] bg-black p-6 font-mono text-white md:p-12">
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <div className="mb-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="border-l-4 border-zinc-800 pl-6">
            <div className="mb-2 h-10 w-64 animate-pulse rounded bg-white/5" />
            <div className="h-4 w-48 animate-pulse rounded bg-white/5" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-10 w-32 animate-pulse rounded bg-white/5" />
            <div className="h-10 w-32 animate-pulse rounded bg-white/5" />
          </div>
        </div>

        <div className="grid flex-grow grid-cols-1 gap-8 lg:grid-cols-4">
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
