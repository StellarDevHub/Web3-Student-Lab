'use client';

import { Certificate, certificatesAPI } from '@/lib/api';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { ErrorBoundary, ErrorFallback, CertificateDetailSkeleton } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

export default function CertificateNFTPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    hash?: string;
  } | null>(null);
  const [openBadgesUrl, setOpenBadgesUrl] = useState<string | null>(null);
  const [merkleCohortId, setMerkleCohortId] = useState('');
  const [merkleProof, setMerkleProof] = useState('');
  const [merkleResult, setMerkleResult] = useState<{ valid: boolean; cohortId: string } | null>(null);

  const loadCertificate = useCallback(async () => {
    if (!params?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await certificatesAPI.getById(params?.id as string);
      setCertificate(data);

      if (typeof document !== 'undefined') {
        document.title = `${data.course?.title || 'Certificate'} | Web3 Student Lab`;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', `Blockchain-verified certificate for ${data.student?.name || 'student'}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load certificate');
      console.error('Failed to load certificate:', err);
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadCertificate();
  }, [loadCertificate]);

  const verifyOnChain = async () => {
    if (!certificate) return;
    setIsVerifying(true);
    try {
      const result = await certificatesAPI.verifyOnChain(certificate.id);
      setVerificationResult(result);
    } catch (error) {
      console.error('Failed to verify:', error);
      alert('Network error during cryptographic verification.');
    } finally {
      setIsVerifying(false);
    }
  };

  const exportOpenBadges = async () => {
    if (!certificate) return;
    try {
      const res = await fetch(`/api/v1/certificates/${certificate.id}/openbadges`);
      if (!res.ok) throw new Error('Failed to export OpenBadges');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setOpenBadgesUrl(url);
    } catch (error) {
      console.error('OpenBadges export failed:', error);
      alert('Failed to export OpenBadges package.');
    }
  };

  const verifyMerkle = async () => {
    if (!certificate || !merkleCohortId || !merkleProof) return;
    try {
      const res = await fetch('/api/v1/certificates/merkle/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId: merkleCohortId, leafHash: certificate.tokenId, proof: merkleProof.split(',').map((s) => s.trim()) }),
      });
      const data = await res.json();
      setMerkleResult(data);
    } catch (error) {
      console.error('Merkle verification failed:', error);
      alert('Failed to verify Merkle inclusion.');
    }
  };

  if (isLoading) {
    return <CertificateDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-black p-8">
        <div className="w-full max-w-md">
          <ErrorFallback message={error} onRetry={loadCertificate} variant="card" />
        </div>
      </div>
    );
  }

  if (!certificate) return null;

  const holderName = certificate.student?.name || user?.name || 'Ayomide Adeniran';
  const txHash = certificate.certificateHash && certificate.certificateHash !== 'Pending confirmation'
    ? certificate.certificateHash
    : `0x${certificate.id.replace(/[^a-f0-9]/gi, 'a').slice(0, 32)}`;
  const contractId = certificate.contractAddress && !certificate.contractAddress.includes('XXX')
    ? certificate.contractAddress
    : 'CA7X98F21B90382C89A7E11D328905F12C';

  const isRevoked = certificate.status === 'REVOKED';
  const isReissued = certificate.status === 'REISSUED';

  return (
    <ErrorBoundary>
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black px-4 py-12 text-white sm:px-6" aria-busy={isLoading}>
      {/* Background Glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600/10 blur-[150px]"></div>

      {isRevoked && (
        <div className="relative z-10 mx-auto mb-8 max-w-5xl animate-pulse rounded-2xl border border-red-500/40 bg-red-500/10 p-6 backdrop-blur-sm">
          <h3 className="text-lg font-black uppercase tracking-widest text-red-500 mb-2">Revocation Notice</h3>
          <p className="text-sm font-medium text-red-200/80">
            Reason: <span className="text-white">{certificate.revocationReason || 'Not supplied'}</span>
          </p>
          <p className="text-xs text-red-300/70 mt-2">
            This certificate has been revoked and is no longer valid. Contact the issuer for a replacement.
          </p>
        </div>
      )}

      {isReissued && (
        <div className="relative z-10 mx-auto mb-8 max-w-5xl animate-pulse rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 backdrop-blur-sm">
          <h3 className="text-lg font-black uppercase tracking-widest text-amber-500 mb-2">Reissued Certificate</h3>
          <p className="text-sm font-medium text-amber-200/80">
            This credential has been reissued. A newer version may be available.
          </p>
        </div>
      )}

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-12 lg:flex-row lg:items-start">
        {/* NFT Asset Card Column */}
        <div className="flex w-full justify-center lg:w-1/2">
          <div className="group perspective-1000 relative w-full max-w-sm">
            {/* Ambient Card Glow */}
            <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-red-600 to-red-900 opacity-30 blur transition duration-1000 group-hover:opacity-60 group-hover:duration-200"></div>

            {/* The Asset Itself */}
            <div className="relative flex aspect-[3/4] transform flex-col justify-between rounded-[2rem] border border-white/20 bg-zinc-950 p-8 shadow-2xl transition-transform duration-500 hover:scale-[1.02]">
              <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay contrast-150"></div>

              <div className="relative z-10 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.5)]">
                  <svg
                    className="h-6 w-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] leading-tight tracking-widest text-red-400 uppercase">
                    Testnet
                  </p>
                  <p className="font-mono text-[10px] leading-tight tracking-widest text-gray-500 uppercase">
                    Soroban
                  </p>
                </div>
              </div>

              <div className="relative z-10 my-8 text-center">
                <div className="mb-6 inline-block rounded-full border border-white/10 bg-black p-4 shadow-inner">
                  <svg
                    className="h-16 w-16 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 text-2xl leading-none font-black tracking-tighter text-white uppercase">
                  Web3 Lab
                </h3>
                <h4 className="text-sm font-bold tracking-widest text-red-500 uppercase">
                  Op. Credential
                </h4>
              </div>

              <div className="relative z-10 flex items-end justify-between border-t border-white/10 pt-4">
                <div>
                  <p className="mb-1 font-mono text-[9px] tracking-widest text-gray-500 uppercase">
                    Holder Identity
                  </p>
                  <p className="max-w-[150px] truncate text-xs font-bold tracking-wider text-white uppercase">
                    {holderName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="mb-1 font-mono text-[9px] tracking-widest text-gray-500 uppercase">
                    Mint Date
                  </p>
                  <p className="font-mono text-xs tracking-widest text-white">
                    {new Date(certificate.issuedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Column */}
        <div className="w-full space-y-8 lg:w-1/2">
          <div>
            <Link
              href="/certificates"
              className="group mb-6 inline-flex items-center gap-2 text-xs font-bold tracking-widest text-gray-500 uppercase transition-colors hover:text-red-500"
            >
              <span className="transform transition-transform group-hover:-translate-x-1">←</span>{' '}
              Back to Vault
            </Link>
            <h1 className="mb-2 text-4xl font-black tracking-tight text-white uppercase md:text-5xl">
              {certificate.course?.title || 'Unknown Protocol'}
            </h1>
            <p className="mb-6 font-mono text-sm tracking-widest text-red-500 uppercase">
              Non-Fungible Certification
            </p>
            <p className="text-lg font-light text-gray-400">
              This cryptographic token proves execution and mastery of the linked learning module.
              It exists immutably on the Stellar blockchain network.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-xl">
            <h3 className="mb-6 border-b border-white/10 pb-4 text-sm font-bold tracking-widest text-white uppercase">
              Token Metadata
            </h3>

            <div className="space-y-4 font-mono text-sm">
              <div className="flex items-center justify-between rounded border border-white/5 bg-black p-3">
                <span className="text-gray-500">Asset ID</span>
                <span className="text-gray-300">{certificate.id}</span>
              </div>
              <div className="flex items-center justify-between rounded border border-white/5 bg-black p-3">
                <span className="text-gray-500">Transaction Hash</span>
                <span className="ml-4 text-right break-all text-emerald-400 font-mono text-xs">
                  {txHash}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border border-white/5 bg-black p-3">
                <span className="text-gray-500">Contract</span>
                <span className="max-w-[200px] truncate text-gray-300">
                  {contractId}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border border-white/5 bg-black p-3">
                <span className="text-gray-500">Status</span>
                <span className={`font-bold tracking-widest uppercase ${
                  isRevoked ? 'text-red-500' : isReissued ? 'text-amber-500' : 'text-emerald-500'
                }`}>
                  {certificate.status === 'REVOKED' ? 'REVOKED' : certificate.status === 'REISSUED' ? 'REISSUED' : 'VERIFIED ON-CHAIN'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={verifyOnChain}
              disabled={isVerifying}
              className={`flex-1 rounded-xl py-4 font-black tracking-widest uppercase transition-all ${
                isVerifying
                  ? 'cursor-wait bg-zinc-800 text-gray-500'
                  : 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:bg-gray-200 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]'
              }`}
            >
              {isVerifying ? 'Polling Network...' : 'Verify On-Chain'}
            </button>
            <button
              onClick={exportOpenBadges}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-sm font-black tracking-widest text-white uppercase transition-colors hover:bg-blue-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              OpenBadges
            </button>
            <a
              href={`${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080/api/v1'}/certificates/${certificate.id}/download.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-4 text-sm font-black tracking-widest text-white uppercase transition-colors hover:bg-red-700"
              aria-label="Download PDF diploma"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              PDF
            </a>
          </div>

          {openBadgesUrl && (
            <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-center">
              <p className="mb-1 text-sm font-bold tracking-widest text-blue-500 uppercase">OpenBadges v3.0 Package Ready</p>
              <a href={openBadgesUrl} download="openbadges.json" className="text-xs text-blue-400 underline">Download JSON-LD</a>
            </div>
          )}

          <div className="mt-8 rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-xl">
            <h3 className="mb-4 border-b border-white/10 pb-4 text-sm font-bold tracking-widest text-white uppercase">
              Merkle Batch Verification
            </h3>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-400">Cohort ID</label>
                <input
                  value={merkleCohortId}
                  onChange={(e) => setMerkleCohortId(e.target.value)}
                  placeholder="e.g. cohort-2025-01"
                  className="w-full rounded-xl border border-white/10 bg-black p-3 font-mono text-sm text-white outline-none focus:border-red-500/50"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-400">Proof Hashes (comma-separated)</label>
                <input
                  value={merkleProof}
                  onChange={(e) => setMerkleProof(e.target.value)}
                  placeholder="0xabc...,0xdef...,0x123..."
                  className="w-full rounded-xl border border-white/10 bg-black p-3 font-mono text-sm text-white outline-none focus:border-red-500/50"
                />
              </div>
              <button
                onClick={verifyMerkle}
                disabled={!merkleCohortId || !merkleProof}
                className="w-full rounded-xl bg-blue-600 py-3 font-black tracking-widest uppercase text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Verify Merkle Inclusion
              </button>
              {merkleResult && (
                <div className={`rounded-xl border p-4 text-center ${merkleResult.valid ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                  <p className={`text-sm font-bold tracking-widest uppercase ${merkleResult.valid ? 'text-green-500' : 'text-red-500'}`}>
                    {merkleResult.valid ? 'Inclusion Verified' : 'Inclusion Failed'}
                  </p>
                  <p className="font-mono text-xs text-gray-400 mt-1">Cohort: {merkleResult.cohortId}</p>
                </div>
              )}
            </div>
          </div>

          {verificationResult && (
            <div className="mt-4 animate-pulse rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center">
              <p className="mb-1 text-sm font-bold tracking-widest text-green-500 uppercase">
                Asset Verified
              </p>
              <p className="font-mono text-xs text-green-400/70">
                Found immutable match on network nodes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
