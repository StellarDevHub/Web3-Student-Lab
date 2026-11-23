'use client';

import { useEffect } from 'react';
import { SharedLibraryCard, useSharedState } from '@/microfrontends/shared/index';

export default function LabRemoteModule() {
  const { selectedLab, setSelectedLab } = useSharedState();

  useEffect(() => {
    document.title = `Remote lab - ${selectedLab}`;
  }, [selectedLab]);

  return (
    <section className="space-y-6 rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-slate-100">Remote Lab Module</h1>
        <p className="text-slate-400">This module is exposed through Module Federation and can be deployed independently.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SharedLibraryCard
          title="Shared UI"
          description="A shared component from the host and remote environment for consistent lab presentation."
        />
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-slate-100">Active lab</h2>
          <p className="mt-2 text-slate-400">{selectedLab}</p>
          <button
            type="button"
            className="mt-4 rounded bg-slate-700 px-4 py-2 text-slate-100 hover:bg-slate-600"
            onClick={() => setSelectedLab('Micro-frontend Analytics Lab')}
          >
            Switch lab
          </button>
        </div>
      </div>
    </section>
  );
}
