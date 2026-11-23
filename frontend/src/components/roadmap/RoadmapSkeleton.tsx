'use client';

import { Skeleton } from '@/components/common/Skeleton';

export function RoadmapSkeleton() {
  return (
    <div
      className="flex min-h-[500px] flex-col items-center justify-center gap-8 px-8"
      role="status"
      aria-label="Loading roadmap"
    >
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-5 w-96" />
      <div className="mt-8 flex flex-col items-center gap-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-40 rounded-xl" />
          <Skeleton className="h-20 w-40 rounded-xl" />
        </div>
        <Skeleton className="h-16 w-1" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-40 rounded-xl" />
          <Skeleton className="h-20 w-40 rounded-xl" />
          <Skeleton className="h-20 w-40 rounded-xl" />
        </div>
        <Skeleton className="h-16 w-1" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-40 rounded-xl" />
        </div>
      </div>
      <span className="sr-only">Loading roadmap visualization...</span>
    </div>
  );
}
