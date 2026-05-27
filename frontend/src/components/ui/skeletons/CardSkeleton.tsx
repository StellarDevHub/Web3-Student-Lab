import { Skeleton } from '../Skeleton';

export function CourseCardSkeleton() {
  return (
    <div className="relative overflow-hidden border border-white/5 bg-zinc-950 p-8">
      <Skeleton className="mb-3 h-7 w-3/4" />
      <div className="mb-6 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="flex items-center justify-between border-t border-white/5 pt-6">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-6">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <Skeleton className="h-10 w-16" />
      </div>
      <Skeleton className="mt-2 h-4 w-24" />
    </div>
  );
}

export function CertCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-red-500/20 bg-black p-8">
      <div className="relative z-10 mb-6 flex items-start justify-between">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <Skeleton className="h-6 w-24 rounded" />
      </div>
      <Skeleton className="mb-2 h-7 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
    </div>
  );
}
