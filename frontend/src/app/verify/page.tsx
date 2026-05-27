'use client';

import { certificatesAPI } from '@/lib/api';
import { AlertCircle, BadgeCheck, Search } from 'lucide-react';
import { useState } from 'react';

type VerificationResponse = {
  isValid: boolean;
  certificate?: any;
  onChainData?: any;
  revocationInfo?: any;
  message?: string;
};

export default function VerifyPage() {
  const [tokenId, setTokenId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResponse | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!tokenId.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = (await certificatesAPI.verifyOnChain(tokenId.trim())) as VerificationResponse;
      setResult(data);
      if (!data?.isValid && !data?.certificate) {
        setError(data?.message || 'Credential not found.');
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-12 sm:px-6 lg:px-8">
      <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <span className="eyebrow">Public credential verification</span>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-5xl">
            Search a credential and see what the platform can verify right now.
          </h1>
          <p className="text-base leading-8 text-[var(--muted)]">
            This flow now uses the backend verification endpoint first, which is more honest than
            pretending to do a full on-chain lookup when the page is not actually wired for that.
          </p>
        </div>

        <div className="surface-card p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="token-id"
                className="mb-3 block text-sm font-medium text-[var(--text-strong)]"
              >
                Certificate token or identifier
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  id="token-id"
                  value={tokenId}
                  onChange={(event) => setTokenId(event.target.value)}
                  placeholder="Enter a certificate token id"
                  className="w-full rounded-2xl border border-white/12 bg-white/5 px-11 py-3.5 text-sm text-[var(--text-strong)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--brand)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !tokenId.trim()}
              className="w-full rounded-2xl bg-[var(--brand)] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Verifying...' : 'Verify credential'}
            </button>
          </form>
        </div>
      </section>

      {error && (
        <section className="surface-card mt-8 flex items-start gap-4 border-[rgba(240,100,45,0.28)] p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(216,72,31,0.14)] text-[var(--brand-strong)]">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">
              Verification incomplete
            </h2>
            <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{error}</p>
          </div>
        </section>
      )}

      {result?.certificate && (
        <section className="surface-card mt-8 overflow-hidden p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                result.isValid
                  ? 'bg-emerald-500/14 text-emerald-300'
                  : 'bg-amber-500/14 text-amber-300'
              }`}
            >
              <BadgeCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-[var(--text-strong)]">
                {result.isValid ? 'Credential verified' : 'Credential found with warnings'}
              </h2>
              <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                {result.message || 'The backend returned a matching credential record.'}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <InfoCard label="Credential" value={result.certificate?.name || 'Unknown'} />
            <InfoCard label="Status" value={result.isValid ? 'Active' : 'Unavailable'} />
            <InfoCard
              label="Token ID"
              value={String(
                result.onChainData?.tokenId || result.certificate?.verification?.tokenId || tokenId
              )}
            />
            <InfoCard
              label="Contract"
              value={String(
                result.onChainData?.contractAddress ||
                  result.certificate?.verification?.contractAddress ||
                  'Not available'
              )}
            />
          </div>

          {result.revocationInfo && (
            <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-5">
              <h3 className="text-sm font-semibold text-[var(--text-strong)]">
                Revocation details
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Reason: {result.revocationInfo.reason || 'Not supplied'}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-5">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 break-all text-sm font-medium leading-7 text-[var(--text-strong)]">
        {value}
      </p>
    </div>
  );
}
