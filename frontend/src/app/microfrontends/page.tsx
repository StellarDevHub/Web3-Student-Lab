'use client';

import MicroFrontendHost from '@/microfrontends/host/MicroFrontendHost';
import { ExperimentalBanner } from '@/components/ui/ExperimentalBanner';
import { SandboxedLabFrame } from '@/microfrontends/sandbox/SandboxedLabFrame';
import { toPublicWalletContext, type PublicWalletContext } from '@/microfrontends/sandbox/protocol';
import { useWallet } from '@/contexts/WalletContext';

function toSandboxNetwork(network: string): PublicWalletContext['network'] {
  if (network === 'PUBLIC') return 'mainnet';
  if (network === 'FUTURENET') return 'futurenet';
  return 'testnet';
}

export default function MicrofrontendsPage() {
  const { publicKey, network } = useWallet();
  const wallet = toPublicWalletContext({ network: toSandboxNetwork(network), publicKey });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-3">
          <h1 className="text-4xl font-semibold">Micro-Frontends Lab</h1>
          <p className="max-w-3xl text-slate-300">
            Independent lab modules can be mounted two ways here: a first-party remote module
            sharing this app's own bundle and state, or a hardened, sandboxed container for
            third-party lab code that must never see this session's cookies, storage, or wallet
            signer.
          </p>
        </header>

        <ExperimentalBanner
          featureName="Module Federation"
          description="The micro-frontend host is experimental. Remote modules are loaded at runtime and may be unavailable in offline or restricted environments."
        />

        <MicroFrontendHost />

        {/* Sandboxed third-party lab container (Issue #1403) */}
        <section className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-100">Sandboxed third-party lab</h2>
            <p className="max-w-3xl text-sm text-slate-400">
              This lab runs in a cross-origin-equivalent iframe (<code>sandbox=&quot;allow-scripts allow-forms&quot;</code>,
              deliberately without <code>allow-same-origin</code>) — the platform itself denies it
              access to this page&apos;s cookies and localStorage, which the panel below proves
              live. It receives a per-mount session token only after announcing itself, and sees a
              read-only wallet projection (network + public key) instead of the real wallet
              context or signer.
            </p>
          </div>
          <SandboxedLabFrame wallet={wallet} title="community-lab.example (sandboxed demo)" />
        </section>
      </div>
    </main>
  );
}
