'use client';

import dynamic from 'next/dynamic';

// The grid (react-window + 50k-row dataset) is client-only and loads after the shell.
const VirtualizedLogTable = dynamic(() => import('@/components/admin/VirtualizedLogTable'), {
  ssr: false,
  loading: () => <div className="h-[660px] w-full animate-pulse rounded-2xl bg-zinc-900/40" aria-busy="true" />,
});

export default function AdminAuditLogsPage() {
  return (
    <div className="min-h-screen bg-background px-4 pt-24 pb-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">
            Audit <span className="text-red-500">Logs</span>
          </h1>
          <p className="text-text-secondary text-sm">
            Inspect administrative and signing activity. Shift-click column headers for multi-column sorting.
          </p>
        </div>
        <VirtualizedLogTable height={600} />
      </div>
    </div>
  );
}
