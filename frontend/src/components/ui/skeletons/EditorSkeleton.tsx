import { Skeleton } from '../Skeleton';

export function EditorSkeleton() {
  return (
    <div className="group relative flex h-full min-h-[400px] w-full flex-grow flex-col bg-[#09090b] p-4">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-4">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-6 w-24 rounded" />
      </div>

      <div className="mt-8 space-y-3 font-mono">
        <div className="flex items-center gap-4">
          <span className="w-4 text-right text-xs text-gray-700">1</span>
          <Skeleton className="h-4 w-1/3" />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-4 text-right text-xs text-gray-700">2</span>
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-4 text-right text-xs text-gray-700">3</span>
          <Skeleton className="ml-8 h-4 w-1/4" />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-4 text-right text-xs text-gray-700">4</span>
          <Skeleton className="ml-8 h-4 w-2/5" />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-4 text-right text-xs text-gray-700">5</span>
          <Skeleton className="ml-16 h-4 w-1/3" />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-4 text-right text-xs text-gray-700">6</span>
          <Skeleton className="ml-16 h-4 w-1/2" />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-4 text-right text-xs text-gray-700">7</span>
          <Skeleton className="ml-8 h-4 w-1/6" />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-4 text-right text-xs text-gray-700">8</span>
          <Skeleton className="h-4 w-1/4" />
        </div>
      </div>

      {/* Loading Overlay */}
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="flex flex-col items-center">
          <Skeleton className="mb-4 h-1 w-12 rounded-full" />
          <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">
            Initializing Editor Environment
          </span>
        </div>
      </div>
    </div>
  );
}
