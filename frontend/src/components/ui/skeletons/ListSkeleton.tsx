import { Skeleton } from '../Skeleton';

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="w-full space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="group rounded-lg border border-white/5 bg-black p-4">
          <div className="mb-2 flex items-start justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
