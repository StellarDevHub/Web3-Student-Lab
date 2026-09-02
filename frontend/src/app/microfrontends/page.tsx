'use client';

import MicroFrontendHost from '@/microfrontends/host/MicroFrontendHost';
import { ExperimentalBanner } from '@/components/ui/ExperimentalBanner';

export default function MicrofrontendsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-3">
          <h1 className="text-4xl font-semibold">Micro-Frontends Lab</h1>
          <p className="max-w-3xl text-slate-300">
            Module Federation enables the frontend to host independent lab modules while sharing
            core UI and state.
          </p>
        </header>

        <ExperimentalBanner
          featureName="Module Federation"
          description="The micro-frontend host is experimental. Remote modules are loaded at runtime and may be unavailable in offline or restricted environments."
        />

        <MicroFrontendHost />
      </div>
    </main>
  );
}
