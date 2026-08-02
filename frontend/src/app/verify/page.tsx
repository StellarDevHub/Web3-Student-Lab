'use client';

import { certificatesAPI } from '@/lib/api';
import { AlertCircle, BadgeCheck, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ErrorBoundary } from '@/components/ui';

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
    <ErrorBoundary>
      <div className="relative min-h-screen bg-black overflow-hidden font-mono selection:bg-red-500/30 pb-24">
        {/* Abstract Background Glows */}
        <div className="absolute top-0 right-[10%] w-[40%] h-[40%] rounded-full bg-[radial-gradient(circle,rgba(220,38,38,0.1),transparent_70%)] blur-[100px] pointer-events-none" />
        
        <div className="mx-auto max-w-5xl px-4 pt-20 sm:px-6 lg:px-8 relative z-10" aria-busy={loading}>
          <section className="grid gap-12 lg:grid-cols-[1fr_1.2fr] items-center mb-16">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-[10px] font-black tracking-widest uppercase shadow-[0_0_20px_rgba(220,38,38,0.2)]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Public Credential Verification</span>
              </div>
              <h1 className="text-5xl sm:text-6xl font-black tracking-tighter text-white uppercase leading-[1.05]">
                VERIFY <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">ON-CHAIN</span>
              </h1>
              <p className="max-w-xl text-sm sm:text-base leading-relaxed text-gray-400 font-light border-l-2 border-red-500/50 pl-4">
                Search a credential token ID and securely verify its authenticity. This checks our backend index to validate the on-chain issuance status.
              </p>
            </div>

            <div className="bg-zinc-950/60 border border-white/5 p-8 sm:p-12 rounded-[2rem] backdrop-blur-md shadow-[0_20px_40px_rgba(0,0,0,0.4)] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <ShieldCheck className="w-48 h-48" />
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                <div>
                  <label
                    htmlFor="token-id"
                    className="mb-4 block text-[10px] font-black uppercase tracking-[0.2em] text-red-500"
                  >
                    Certificate Token ID
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                    <input
                      id="token-id"
                      value={tokenId}
                      onChange={(event) => setTokenId(event.target.value)}
                      placeholder="Enter a certificate token ID"
                      className="w-full rounded-2xl border border-white/10 bg-white/5 pl-14 pr-6 py-4 text-sm text-white font-medium outline-none transition-all placeholder:text-gray-600 focus:border-red-500/50 focus:bg-white/10 focus:shadow-[0_0_20px_rgba(220,38,38,0.2)]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !tokenId.trim()}
                  className="w-full relative overflow-hidden rounded-2xl bg-red-600 px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-white shadow-[0_0_30px_rgba(220,38,38,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(220,38,38,0.5)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 group"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full transition-transform group-hover:translate-y-0" />
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {loading ? 'Verifying on-chain...' : 'Verify Credential'}
                    {!loading && <BadgeCheck className="w-4 h-4" />}
                  </span>
                </button>
              </form>
            </div>
          </section>

          {error && (
            <section className="bg-red-500/10 border border-red-500/30 rounded-[2rem] p-8 flex items-start gap-6 backdrop-blur-sm shadow-[0_0_30px_rgba(220,38,38,0.15)] animate-in fade-in slide-in-from-bottom-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-500 shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-widest text-red-500 mb-2">
                  Verification Failed
                </h2>
                <p className="text-sm leading-relaxed text-red-200/70 font-light">{error}</p>
              </div>
            </section>
          )}

          {result?.certificate && (
            <section className="bg-zinc-950/60 border border-white/5 rounded-[2rem] overflow-hidden p-8 sm:p-12 backdrop-blur-md shadow-[0_20px_40px_rgba(0,0,0,0.4)] animate-in fade-in slide-in-from-bottom-4 mt-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-10 pb-10 border-b border-white/5">
                <div
                  className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-lg ${
                    result.isValid
                      ? 'bg-green-500/20 border border-green-500/40 text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                      : 'bg-amber-500/20 border border-amber-500/40 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                  }`}
                >
                  <BadgeCheck className="h-8 w-8" />
                </div>
                <div>
                  <h2 className={`text-3xl font-black uppercase tracking-widest mb-2 ${result.isValid ? 'text-green-500' : 'text-amber-500'}`}>
                    {result.isValid ? 'Credential Verified' : 'Warning: Found with Issues'}
                  </h2>
                  <p className="text-sm leading-relaxed text-gray-400 font-light border-l-2 border-white/10 pl-4">
                    {result.message || 'The backend returned a matching credential record.'}
                  </p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <InfoCard label="Credential" value={result.certificate?.name || 'Unknown'} />
                <InfoCard label="Status" value={result.isValid ? 'Active' : 'Unavailable'} isValid={result.isValid} />
                <InfoCard
                  label="Token ID"
                  value={String(
                    result.onChainData?.tokenId || result.certificate?.verification?.tokenId || tokenId
                  )}
                  isCode
                />
                <InfoCard
                  label="Contract"
                  value={String(
                    result.onChainData?.contractAddress ||
                      result.certificate?.verification?.contractAddress ||
                      'Not available'
                  )}
                  isCode
                />
              </div>

              {result.revocationInfo && (
                <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 backdrop-blur-sm">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 mb-3">
                    Revocation Details
                  </h3>
                  <p className="text-sm font-medium text-amber-200/80">
                    Reason: <span className="text-white">{result.revocationInfo.reason || 'Not supplied'}</span>
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

function InfoCard({ label, value, isCode, isValid }: { label: string; value: string, isCode?: boolean, isValid?: boolean }) {
  return (
    <div className="relative group rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:bg-white/[0.04] transition-colors">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-500 mb-3">{label}</p>
      <p className={`break-all ${isCode ? 'font-mono text-xs text-gray-400' : 'text-lg font-bold text-white'} ${isValid !== undefined ? (isValid ? 'text-green-400' : 'text-amber-400') : ''}`}>
        {value}
      </p>
    </div>
  );
}
