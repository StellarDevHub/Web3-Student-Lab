'use client';

import { Suspense, lazy, useMemo } from 'react';
import { SharedStateProvider, SharedLibraryCard } from '@/microfrontends/shared/index';

const RemoteLab = /*#__PURE__*/ lazy(() => import('lab_remote/LabRemote'));

export default function MicroFrontendHost() {
  const remoteTips = useMemo(
    () => [
      'Shared React and Zustand make micro-frontends feel seamless.',
      'Module Federation enables independent deployment of lab modules.',
    ],
    []
  );

  return (
    <SharedStateProvider>
      <div className="space-y-6 rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-slate-100">Micro-Frontend Host</h1>
          <p className="text-slate-400">Host shell with shared state and a remote lab module loaded dynamically.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SharedLibraryCard title="Shared state bus" description="State and components are shared across the host and remote modules." />
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-slate-100">Ready for remote labs</h2>
            <ul className="mt-4 space-y-2 text-slate-300">
              {remoteTips.map((tip) => (
                <li key={tip}>• {tip}</li>
              ))}
            </ul>
          </div>
        </div>

        <fieldset className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
          <legend className="px-2 text-sm font-semibold text-slate-200">Remote module</legend>
          <Suspense fallback={<div className="text-slate-300">Loading remote lab module...</div>}>
            <RemoteLab />
          </Suspense>
        </fieldset>
      </div>
    </SharedStateProvider>
  );
}
