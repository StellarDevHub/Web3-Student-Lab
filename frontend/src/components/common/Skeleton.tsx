import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div
      className={`animate-pulse rounded-md bg-white/5 ${className}`}
    />
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-xl">
      <Skeleton className="mb-4 h-4 w-1/4" />
      <Skeleton className="mb-2 h-8 w-3/4" />
      <Skeleton className="h-4 w-full" />
    </div>
  );
};

export const ChartSkeleton: React.FC = () => {
  return (
    <div className="flex h-[300px] w-full flex-col items-center justify-center gap-4 rounded-xl border border-white/5 bg-black/20 p-6">
      <div className="flex w-full items-end justify-between gap-2 h-full px-4">
        {[40, 70, 45, 90, 65, 80, 50].map((height, i) => (
          <Skeleton key={i} className="w-full" style={{ height: `${height}%` }} />
        ))}
      </div>
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
};
