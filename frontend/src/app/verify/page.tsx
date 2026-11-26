'use client';

import { certificatesAPI } from '@/lib/api';
import { VerificationBadge } from '@/components/certificates/VerificationBadge';
import {
  AlertCircle,
  BadgeCheck,
  FileText,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { ErrorBoundary } from '@/components/ui';
import { ZkProofPanel } from '@/components/zk/ZkProofPanel';
import type { VerificationResult } from '@/lib/crypto/pdfVerifier';

// ─────────────────────────────────────────────────────────────────────────────
// On-chain lookup types (existing)
// ─────────────────────────────────────────────────────────────────────────────

type VerificationResponse = {
  isValid: boolean;
  status?: string;
  certificate?: Record<string, unknown>;
  onChainData?: Record<string, unknown>;
  revocationInfo?: { reason?: string };
  message?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF drop zone
// ─────────────────────────────────────────────────────────────────────────────

type DropState = 'idle' | 'over' | 'verifying';

interface PdfDropZoneProps {
  onResult: (result: VerificationResult) => void;
  onClear: () => void;
  hasResult: boolean;
}

function PdfDropZone({ onResult, onClear, hasResult }: PdfDropZoneProps) {
  const [dropState, setDropState] = useState<DropState>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setError('Only PDF files are accepted.');
        return;
      }
      setError(null);
      setFileName(file.name);
      setDropState('verifying');
      try {
        // Dynamic import keeps the pdf-lib + SubtleCrypto code out of the
        // initial bundle.
        const { verifyDiplomaPdf } = await import('@/lib/crypto/pdfVerifier');
        const result = await verifyDiplomaPdf(file);
        onResult(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error during verification.');
      } finally {
        setDropState('idle');
      }
    },
    [onResult]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDropState('idle');
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropState('over');
  };

  const handleDragLeave = () => setDropState('idle');

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so the same file can be re-dropped after clearing.
    e.target.value = '';
  };

  const handleClear = () => {
    setFileName(null);
    setError(null);
    setDropState('idle');
    onClear();
  };

  const isOver = dropState === 'over';
  const isVerifying = dropState === 'verifying';

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a diploma PDF here or click to browse"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        className={`
          relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-4
          rounded-2xl border-2 border-dashed p-8 text-center transition-all
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50
          ${
            isOver
              ? 'border-red-500/80 bg-red-500/10 shadow-[0_0_30px_rgba(220,38,38,0.25)]'
              : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="sr-only"
          aria-hidden="true"
          onChange={handleFileInput}
        />

        {isVerifying ? (
          <>
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-red-500/30 border-t-red-500" />
            <p className="text-sm font-medium text-zinc-400">Verifying signature…</p>
          </>
        ) : (
          <>
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors ${
                isOver
                  ? 'border-red-500/60 bg-red-500/20 text-red-400'
                  : 'border-white/10 bg-white/5 text-zinc-500'
              }`}
            >
              <Upload className="h-6 w-6" />
            </div>

            {fileName ? (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="max-w-xs truncate text-sm font-medium text-zinc-300">
                  {fileName}
                </span>
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                  className="rounded-full p-0.5 text-zinc-500 transition-colors hover:text-zinc-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm font-semibold text-zinc-300">
                    Drop your diploma PDF here
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    or click to browse — verification runs entirely in your browser
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Inline error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-200/80">{error}</p>
        </div>
      )}

      {/* Reset button when result is showing */}
      {hasResult && !isVerifying && (
        <button
          type="button"
          onClick={handleClear}
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
        >
          Verify another file
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InfoCard (reused from the original on-chain section)
// ─────────────────────────────────────────────────────────────────────────────

function InfoCard({
  label,
  value,
  isCode,
  isValid,
}: {
  label: string;
  value: string;
  isCode?: boolean;
  isValid?: boolean;
}) {
  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition-colors hover:bg-white/[0.04]">
      <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-red-500">{label}</p>
      <p
        className={`break-all ${isCode ? 'font-mono text-xs text-gray-400' : 'text-lg font-bold text-white'} ${
          isValid !== undefined ? (isValid ? 'text-green-400' : 'text-amber-400') : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function VerifyPage() {
  // On-chain lookup state (existing)
  const [tokenId, setTokenId] = useState('');
  const [loading, setLoading] = useState(false);
  const [onChainError, setOnChainError] = useState<string | null>(null);
  const [onChainResult, setOnChainResult] = useState<VerificationResponse | null>(null);

  // PDF drop zone state
  const [pdfResult, setPdfResult] = useState<VerificationResult | null>(null);

  // ── On-chain form handler ────────────────────────────────────────────────

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!tokenId.trim()) return;

    setLoading(true);
    setOnChainError(null);
    setOnChainResult(null);

    try {
      const data = (await certificatesAPI.verifyOnChain(
        tokenId.trim()
      )) as VerificationResponse;
      setOnChainResult(data);
      if (!data?.isValid && !data?.certificate) {
        setOnChainError(data?.message || 'Credential not found.');
      }
    } catch (err) {
      setOnChainError(
        err instanceof Error ? err.message : 'Verification failed.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ErrorBoundary>
      <div className="relative min-h-screen bg-black overflow-hidden font-mono selection:bg-red-500/30 pb-24">
        {/* Background glows */}
        <div className="pointer-events-none absolute top-0 right-[10%] w-[40%] h-[40%] rounded-full bg-[radial-gradient(circle,rgba(220,38,38,0.1),transparent_70%)] blur-[100px]" />
        <div className="pointer-events-none absolute bottom-0 left-[5%] w-[30%] h-[30%] rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.05),transparent_70%)] blur-[120px]" />

        <div
          className="mx-auto max-w-5xl px-4 pt-20 sm:px-6 lg:px-8 relative z-10"
          aria-busy={loading}
        >
          {/* ── Hero header ─────────────────────────────────────────────── */}
          <div className="mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-400 shadow-[0_0_20px_rgba(220,38,38,0.2)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Credential Verification</span>
            </div>
            <h1 className="text-5xl sm:text-6xl font-black tracking-tighter text-white uppercase leading-[1.05]">
              VERIFY <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
                CREDENTIALS
              </span>
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-gray-400 font-light border-l-2 border-red-500/50 pl-4">
              Verify diploma PDFs entirely in your browser using Ed25519 cryptography, or look up
              any certificate by its on-chain token ID.
            </p>
          </div>

          {/* ── Two-column layout ────────────────────────────────────────── */}
          <div className="grid gap-10 lg:grid-cols-2 mb-16">

            {/* ── PDF client-side verifier ───────────────────────────────── */}
            <section aria-labelledby="pdf-verify-heading">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-green-500/30 bg-green-500/10 text-green-400">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h2
                    id="pdf-verify-heading"
                    className="text-xs font-black uppercase tracking-[0.2em] text-green-400"
                  >
                    PDF Signature Verifier
                  </h2>
                  <p className="text-[11px] text-zinc-500">
                    100% client-side · no server required
                  </p>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/5 bg-zinc-950/60 p-6 sm:p-8 backdrop-blur-md shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
                <PdfDropZone
                  onResult={setPdfResult}
                  onClear={() => setPdfResult(null)}
                  hasResult={pdfResult !== null}
                />
              </div>
            </section>

            {/* ── On-chain token lookup ──────────────────────────────────── */}
            <section aria-labelledby="onchain-verify-heading">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2
                    id="onchain-verify-heading"
                    className="text-xs font-black uppercase tracking-[0.2em] text-red-400"
                  >
                    On-Chain Lookup
                  </h2>
                  <p className="text-[11px] text-zinc-500">Verify via backend index</p>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/5 bg-zinc-950/60 p-6 sm:p-8 backdrop-blur-md shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label
                      htmlFor="token-id"
                      className="mb-3 block text-[10px] font-black uppercase tracking-[0.2em] text-red-500"
                    >
                      Certificate Token ID
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                      <input
                        id="token-id"
                        value={tokenId}
                        onChange={(e) => setTokenId(e.target.value)}
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
                      {loading ? 'Verifying on-chain…' : 'Verify Credential'}
                      {!loading && <BadgeCheck className="h-4 w-4" />}
                    </span>
                  </button>
                </form>
              </div>
            </section>
          </div>

          {/* ── PDF verification result ──────────────────────────────────── */}
          {pdfResult && (
            <section className="mb-10" aria-label="PDF verification result">
              <VerificationBadge result={pdfResult} />
            </section>
          )}

          {/* ── On-chain lookup error ────────────────────────────────────── */}
          {onChainError && (
            <section className="mb-8 flex items-start gap-6 rounded-[2rem] border border-red-500/30 bg-red-500/10 p-8 backdrop-blur-sm shadow-[0_0_30px_rgba(220,38,38,0.15)] animate-in fade-in slide-in-from-bottom-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-500 shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h2 className="mb-2 text-xl font-black uppercase tracking-widest text-red-500">
                  Verification Failed
                </h2>
                <p className="text-sm leading-relaxed text-red-200/70 font-light">{onChainError}</p>
              </div>
            </section>
          )}

          {/* ── On-chain lookup result ───────────────────────────────────── */}
          {onChainResult?.certificate && (
            <section className="animate-in fade-in slide-in-from-bottom-4 mt-8 rounded-[2rem] border border-white/5 bg-zinc-950/60 p-8 sm:p-12 backdrop-blur-md shadow-[0_20px_40px_rgba(0,0,0,0.4)] overflow-hidden">
              <div className="mb-10 flex flex-col sm:flex-row sm:items-center gap-6 pb-10 border-b border-white/5">
                <div
                  className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-lg ${
                    onChainResult.isValid
                      ? 'bg-green-500/20 border border-green-500/40 text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                      : 'bg-amber-500/20 border border-amber-500/40 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                  }`}
                >
                  <BadgeCheck className="h-8 w-8" />
                </div>
                <div>
                  <h2
                    className={`text-3xl font-black uppercase tracking-widest mb-2 ${
                      onChainResult.isValid ? 'text-green-500' : 'text-amber-500'
                    }`}
                  >
                    {onChainResult.isValid ? 'Credential Verified' : 'Warning: Found with Issues'}
                  </h2>
                  <p className="text-sm leading-relaxed text-gray-400 font-light border-l-2 border-white/10 pl-4">
                    {onChainResult.message || 'The backend returned a matching credential record.'}
                  </p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <InfoCard
                  label="Credential"
                  value={String((onChainResult.certificate as Record<string,unknown>)?.name ?? 'Unknown')}
                />
                <InfoCard
                  label="Status"
                  value={
                    onChainResult.status === 'REVOKED'
                      ? 'REVOKED'
                      : onChainResult.status === 'REISSUED'
                      ? 'REISSUED'
                      : onChainResult.isValid
                      ? 'Active'
                      : 'Unavailable'
                  }
                  isValid={onChainResult.isValid}
                />
                <InfoCard
                  label="Token ID"
                  value={String(
                    (onChainResult.onChainData as Record<string,unknown>)?.tokenId ??
                      (onChainResult.certificate as Record<string,unknown>)?.verification ??
                      tokenId
                  )}
                  isCode
                />
                <InfoCard
                  label="Contract"
                  value={String(
                    (onChainResult.onChainData as Record<string,unknown>)?.contractAddress ??
                      'Not available'
                  )}
                  isCode
                />
              </div>

              {onChainResult.status === 'REVOKED' && onChainResult.revocationInfo && (
                <div className="mt-8 animate-pulse rounded-2xl border border-red-500/40 bg-red-500/10 p-6 backdrop-blur-sm">
                  <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-red-500">
                    Revocation Notice
                  </h3>
                  <p className="text-sm font-medium text-red-200/80">
                    Reason:{' '}
                    <span className="text-white">
                      {onChainResult.revocationInfo.reason || 'Not supplied'}
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-red-300/70">
                    This certificate has been revoked and is no longer valid. Contact the issuer for
                    a replacement.
                  </p>
                </div>
              )}
            </section>
          )}

          <ZkProofPanel />
        </div>
      </div>
    </ErrorBoundary>
  );
}
