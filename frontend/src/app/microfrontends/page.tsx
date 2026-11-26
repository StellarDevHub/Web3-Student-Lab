'use client';

import MicroFrontendHost from '@/microfrontends/host/MicroFrontendHost';
import { ExperimentalBanner } from '@/components/ui/ExperimentalBanner';
import { SandboxedLabFrame } from '@/microfrontends/sandbox/SandboxedLabFrame';
import { toPublicWalletContext, type PublicWalletContext } from '@/microfrontends/sandbox/protocol';
import { WidgetSandbox } from '@/lib/mfe/WidgetSandbox';
import { useWallet } from '@/contexts/WalletContext';
import { ShieldCheck } from 'lucide-react';

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
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-semibold">Micro-Frontends & Course Widget Sandbox</h1>
            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400">
              FE-072 Hardened
            </span>
          </div>
          <p className="max-w-3xl text-slate-300">
            Micro-frontends can be mounted in two operational trust tiers: trusted first-party modules
            compiled with the host bundle, and isolated community course widgets running inside an opaque-origin
            sandbox with bidirectional typed RPC and render-boundary isolation.
          </p>
        </header>

        <ExperimentalBanner
          featureName="Microfrontend Isolation Sandbox"
          description="Community instructor course widgets execute inside an isolated iframe with sandbox='allow-scripts' (omitting allow-same-origin). Third-party scripts are cryptographically and structurally blocked from window.stellar and localStorage."
        />

        {/* Section 1: FE-072 Untrusted Community Course Widget Sandbox */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-emerald-400" />
                Community Course Widget Sandbox
              </h2>
              <p className="text-sm text-slate-400">
                Untrusted instructor widgets run in an isolated iframe with strict JSON-RPC 2.0 schema validation and automatic quarantine.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-emerald-400">
                sandbox=&quot;allow-scripts&quot;
              </span>
              <span className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-sky-400">
                JSON-RPC 2.0
              </span>
            </div>
          </div>

          <WidgetSandbox
            widgetId="community-stellar-interactive-widget"
            title="Community Course Interactive Sandbox"
            walletContext={{
              publicKey,
              network: toSandboxNetwork(network),
            }}
          />
        </section>

        {/* Section 2: First-Party Module Federation */}
        <section className="space-y-4 pt-4 border-t border-slate-800/80">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-200">First-Party Federated Remotes</h2>
            <p className="text-sm text-slate-400">
              Internal trusted modules compiled together and sharing application state.
            </p>
          </div>
          <MicroFrontendHost />
        </section>

        {/* Section 3: Sandboxed third-party lab container (Issue #1403) */}
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

