import { Skeleton } from '../Skeleton';

export function GraphSkeleton() {
  return (
    <div className="relative flex h-full min-h-[400px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
      <div className="absolute inset-0 flex items-center justify-center opacity-20">
        <svg width="100%" height="100%">
          <circle
            cx="50%"
            cy="50%"
            r="120"
            stroke="#3f3f46"
            strokeWidth="1"
            fill="none"
            strokeDasharray="4 4"
          />
          <circle
            cx="50%"
            cy="50%"
            r="60"
            stroke="#3f3f46"
            strokeWidth="1"
            fill="none"
            strokeDasharray="4 4"
          />

          <line x1="50%" y1="50%" x2="30%" y2="20%" stroke="#3f3f46" strokeWidth="2" />
          <line x1="50%" y1="50%" x2="70%" y2="30%" stroke="#3f3f46" strokeWidth="2" />
          <line x1="50%" y1="50%" x2="40%" y2="80%" stroke="#3f3f46" strokeWidth="2" />
          <line x1="50%" y1="50%" x2="80%" y2="70%" stroke="#3f3f46" strokeWidth="2" />
        </svg>
      </div>

      {/* Central Node */}
      <Skeleton className="absolute top-1/2 left-1/2 z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full" />

      {/* Surrounding Nodes */}
      <Skeleton className="absolute top-[20%] left-[30%] z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <Skeleton className="absolute top-[30%] left-[70%] z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <Skeleton className="absolute top-[80%] left-[40%] z-10 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <Skeleton className="absolute top-[70%] left-[80%] z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full" />

      {/* Loading Text */}
      <div className="absolute bottom-6 flex flex-col items-center">
        <Skeleton className="mb-2 h-4 w-32" />
        <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
          Synchronizing Nodes...
        </span>
      </div>
    </div>
  );
}
