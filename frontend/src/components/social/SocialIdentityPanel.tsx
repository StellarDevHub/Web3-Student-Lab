'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { socialIdentityAPI } from '@/lib/api';

type SocialStatus = Awaited<ReturnType<typeof socialIdentityAPI.getStatus>>;
type Provider = 'github' | 'discord';

export function SocialIdentityPanel() {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    socialIdentityAPI.getStatus()
      .then((result) => { if (active) setStatus(result); })
      .catch(() => { if (active) setError('Social account status is unavailable.'); });
    return () => { active = false; };
  }, [isAuthenticated]);

  async function link(provider: Provider) {
    setLoadingProvider(provider);
    setError(null);
    try {
      const authorizationUrl = provider === 'github'
        ? await socialIdentityAPI.startGitHubLink()
        : await socialIdentityAPI.startDiscordLink();
      window.location.assign(authorizationUrl);
    } catch {
      setError(`Could not start ${provider === 'github' ? 'GitHub' : 'Discord'} linking.`);
      setLoadingProvider(null);
    }
  }

  if (!isAuthenticated) return null;

  return (
    <section aria-labelledby="social-identity-heading" className="rounded-2xl border border-white/10 bg-zinc-950/80 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="social-identity-heading" className="text-lg font-bold text-white">Social accounts</h2>
          <p className="mt-1 text-sm text-gray-400">Connect the accounts you use for team verification.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {(['github', 'discord'] as const).map((provider) => {
          const identity = status?.[provider];
          const label = provider === 'github' ? 'GitHub' : 'Discord';
          return (
            <div key={provider} className="flex min-h-20 items-center justify-between gap-3 border-t border-white/10 py-4">
              <div className="min-w-0">
                <p className="font-semibold text-white">{label}</p>
                {identity?.linked
                  ? <p className="truncate text-sm text-gray-400">@{identity.username}</p>
                  : <p className="text-sm text-gray-500">{status ? 'Not linked' : 'Loading status'}</p>}
              </div>
              {identity?.linked ? (
                <span className="shrink-0 text-sm font-medium text-emerald-400" aria-label={`${label} linked`}>
                  <span aria-hidden="true">✓</span> Linked
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => link(provider)}
                  disabled={loadingProvider !== null || !status}
                  className="shrink-0 rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white transition hover:border-white/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingProvider === provider ? 'Opening…' : `Link ${label}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <p role="status" className="mt-3 text-sm text-rose-400">{error}</p>}
    </section>
  );
}
