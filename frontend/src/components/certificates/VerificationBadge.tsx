'use client';

import { AlertTriangle, CheckCircle2, Clock, FileQuestion, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import type { VerificationResult, VerificationStatus } from '@/lib/crypto/pdfVerifier';

interface Props {
  result: VerificationResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status configuration
// ─────────────────────────────────────────────────────────────────────────────

type StatusConfig = {
  icon: React.ReactNode;
  title: string;
  borderColor: string;
  bgColor: string;
  titleColor: string;
  glowColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
};

function getStatusConfig(status: VerificationStatus): StatusConfig {
  switch (status) {
    case 'verified':
      return {
        icon: <ShieldCheck className="h-8 w-8" />,
        title: 'Cryptographically Verified by Web3 Student Lab',
        borderColor: 'border-green-500/40',
        bgColor: 'bg-green-500/[0.07]',
        titleColor: 'text-green-400',
        glowColor: 'shadow-[0_0_40px_rgba(34,197,94,0.15)]',
        badgeBg: 'bg-green-500/20',
        badgeText: 'text-green-300',
        badgeBorder: 'border-green-500/40',
      };
    case 'hash_mismatch':
      return {
        icon: <AlertTriangle className="h-8 w-8" />,
        title: 'Tampered — Content Hash Mismatch',
        borderColor: 'border-red-500/50',
        bgColor: 'bg-red-500/[0.08]',
        titleColor: 'text-red-400',
        glowColor: 'shadow-[0_0_40px_rgba(220,38,38,0.2)]',
        badgeBg: 'bg-red-500/20',
        badgeText: 'text-red-300',
        badgeBorder: 'border-red-500/40',
      };
    case 'invalid_signature':
      return {
        icon: <XCircle className="h-8 w-8" />,
        title: 'Invalid Signature — Verification Failed',
        borderColor: 'border-red-500/50',
        bgColor: 'bg-red-500/[0.08]',
        titleColor: 'text-red-400',
        glowColor: 'shadow-[0_0_40px_rgba(220,38,38,0.2)]',
        badgeBg: 'bg-red-500/20',
        badgeText: 'text-red-300',
        badgeBorder: 'border-red-500/40',
      };
    case 'missing_metadata':
      return {
        icon: <FileQuestion className="h-8 w-8" />,
        title: 'No Cryptographic Metadata Found',
        borderColor: 'border-amber-500/40',
        bgColor: 'bg-amber-500/[0.07]',
        titleColor: 'text-amber-400',
        glowColor: 'shadow-[0_0_30px_rgba(245,158,11,0.15)]',
        badgeBg: 'bg-amber-500/20',
        badgeText: 'text-amber-300',
        badgeBorder: 'border-amber-500/40',
      };
    case 'unsupported':
      return {
        icon: <ShieldAlert className="h-8 w-8" />,
        title: 'Browser Does Not Support Ed25519',
        borderColor: 'border-amber-500/40',
        bgColor: 'bg-amber-500/[0.07]',
        titleColor: 'text-amber-400',
        glowColor: 'shadow-[0_0_30px_rgba(245,158,11,0.15)]',
        badgeBg: 'bg-amber-500/20',
        badgeText: 'text-amber-300',
        badgeBorder: 'border-amber-500/40',
      };
    default:
      return {
        icon: <ShieldAlert className="h-8 w-8" />,
        title: 'Verification Error',
        borderColor: 'border-zinc-700/60',
        bgColor: 'bg-zinc-800/40',
        titleColor: 'text-zinc-300',
        glowColor: '',
        badgeBg: 'bg-zinc-700/40',
        badgeText: 'text-zinc-400',
        badgeBorder: 'border-zinc-600/40',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4">
      <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p
        className={`break-all leading-relaxed ${
          mono ? 'font-mono text-xs text-zinc-400' : 'text-sm font-medium text-zinc-200'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main badge component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders a verification outcome card.
 *
 * - Green for a fully verified diploma.
 * - Red for hash mismatch or invalid signature (tampered file).
 * - Amber for missing metadata or unsupported environment.
 */
export function VerificationBadge({ result }: Props) {
  const cfg = getStatusConfig(result.status);
  const isVerified = result.status === 'verified';
  const isTampered = result.status === 'hash_mismatch' || result.status === 'invalid_signature';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={cfg.title}
      className={`rounded-[2rem] border ${cfg.borderColor} ${cfg.bgColor} ${cfg.glowColor} p-8 sm:p-10 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4`}
    >
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-6 mb-8">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border ${cfg.badgeBorder} ${cfg.badgeBg} ${cfg.titleColor}`}
        >
          {cfg.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {/* Status pill */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border ${cfg.badgeBorder} ${cfg.badgeBg} ${cfg.badgeText} px-3 py-1 text-[10px] font-black uppercase tracking-widest`}
            >
              {isVerified && <CheckCircle2 className="h-3 w-3" />}
              {isTampered && <XCircle className="h-3 w-3" />}
              {result.status.replace(/_/g, ' ')}
            </span>

            {/* Timing badge */}
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-mono text-zinc-500">
              <Clock className="h-3 w-3" />
              {result.durationMs.toFixed(0)} ms
            </span>
          </div>

          <h2 className={`text-xl sm:text-2xl font-black uppercase tracking-tight ${cfg.titleColor}`}>
            {cfg.title}
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-zinc-400 font-light">
            {result.message}
          </p>
        </div>
      </div>

      {/* Tamper alert callout */}
      {isTampered && (
        <div className="mb-6 flex items-start gap-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-6 py-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <p className="text-sm leading-relaxed text-red-200/80">
            {result.status === 'hash_mismatch'
              ? 'The PDF content no longer matches the hash recorded at issuance. The file has been modified — do not trust this diploma.'
              : "The digital signature does not match the issuer's public key. The certificate metadata may have been forged or corrupted."}
          </p>
        </div>
      )}

      {/* Metadata grid */}
      {(result.publicKey || result.contentHash) && (
        <div className="grid gap-4 sm:grid-cols-1">
          {result.publicKey && (
            <MetaRow
              label="Issuer Public Key (Ed25519)"
              value={result.publicKey}
              mono
            />
          )}
          {result.contentHash && (
            <MetaRow
              label="Content Hash (SHA-256)"
              value={result.contentHash}
              mono
            />
          )}
        </div>
      )}
    </div>
  );
}

export default VerificationBadge;
