"use client";

import React from "react";
import { useState } from "react";
import type { CertificateData } from "@/lib/soroban";

export default function VerifyCertificatePage() {
  const [certificateId, setCertificateId] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<CertificateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean>(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificateId.trim()) return;

    setIsVerifying(true);
    setError(null);
    setResult(null);
    setVerified(false);

    try {
      const { verifyCertificateOnChain } = await import("@/lib/soroban");
      const data = await verifyCertificateOnChain(certificateId.trim());

      if (data) {
        setResult(data);
        setVerified(true);
      } else {
        setError("Certificate not found on blockchain");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to verify certificate",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-black text-white relative px-4 py-16 overflow-hidden">
      {/* Abstract Background Glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="w-20 h-20 bg-zinc-950 border border-red-500/50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_20px_rgba(220,38,38,0.2)]">
            <svg
              className="w-10 h-10 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 uppercase tracking-tight">
            Cryptographic <span className="text-red-600">Verification</span>
          </h1>
          <p className="text-lg text-gray-400 font-light tracking-wide">
            Query the Stellar network to validate on-chain credentials
          </p>
        </div>

        {/* Verification Form */}
        <div className="bg-zinc-950 border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] p-10 mb-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-transparent"></div>

          <form onSubmit={handleVerify} className="space-y-8">
            <div>
              <label
                htmlFor="certificateId"
                className="block text-sm font-bold text-gray-400 mb-3 uppercase tracking-widest"
              >
                Credential Symbol / Hash
              </label>
              <div className="relative">
                <input
                  id="certificateId"
                  type="text"
                  value={certificateId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCertificateId(e.target.value)}
                  placeholder="e.g. SOLID, INIT505, 0x..."
                  className="w-full px-6 py-5 rounded-xl border border-white/20 bg-black text-white font-mono focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors placeholder-gray-700 text-lg uppercase tracking-wider"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isVerifying || !certificateId.trim()}
              className={`w-full py-5 px-6 rounded-xl font-black tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(220,38,38,0.3)] ${
                isVerifying || !certificateId.trim()
                  ? "bg-red-900/50 text-gray-500 cursor-not-allowed border border-red-900/50"
                  : "bg-red-600 hover:bg-red-700 text-white hover:shadow-[0_0_30px_rgba(220,38,38,0.6)] transform hover:-translate-y-0.5"
              }`}
            >
              {isVerifying ? (
                <span className="flex items-center justify-center gap-3">
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Querying Blockchain...
                </span>
              ) : (
                "Run Verification"
              )}
            </button>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-950/30 border border-red-500/50 rounded-xl p-6 mb-10 backdrop-blur-sm animate-pulse">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-red-500/20">
                <svg
                  className="w-6 h-6 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-red-500 mb-1 uppercase tracking-wider">
                  Query Failed
                </h3>
                <p className="text-red-400/80 font-mono text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success Result */}
        {result && verified && (
          <div className="bg-black border border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.1)] rounded-2xl p-10 mb-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-bl-full pointer-events-none"></div>

            <div className="flex items-start gap-5 mb-8 relative z-10">
              <div className="w-14 h-14 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                <svg
                  className="w-8 h-8 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-wide">
                  Credential <span className="text-green-500">Verified</span>
                </h3>
                <p className="text-green-500/80 font-mono text-sm">
                  Cryptographic proof confirmed on Stellar
                </p>
              </div>
            </div>

            <div className="bg-zinc-950 border border-white/5 rounded-xl p-8 space-y-6 relative z-10">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">
                    Symbol
                  </p>
                  <p className="text-2xl font-black text-white">
                    {result.symbol}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">
                    Identity
                  </p>
                  <p className="text-xl font-bold text-gray-300">
                    {result.student}
                  </p>
                </div>
              </div>
              <div className="pt-6 border-t border-white/5">
                <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">
                  Protocol / Curriculum
                </p>
                <p className="text-lg font-bold text-white">
                  {result.course_name}
                </p>
              </div>
              <div className="pt-6 border-t border-white/5">
                <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">
                  Timestamp
                </p>
                <p className="text-lg font-mono text-gray-300">
                  {new Date(Number(result.issue_date) * 1000).toLocaleString(
                    "en-US",
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "short",
                    },
                  )}
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-green-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm font-bold text-green-500 uppercase tracking-widest">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                Immutable Record Connected
              </div>
              <a
                href="#"
                className="w-8 h-8 bg-zinc-900 rounded-full flex items-center justify-center hover:bg-zinc-800 transition-colors border border-white/10"
              >
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-16 bg-zinc-950 border border-white/10 rounded-2xl p-10 shadow-sm relative overflow-hidden">
          <div className="absolute -left-12 -bottom-12 w-32 h-32 bg-red-600/10 rounded-full blur-[40px] pointer-events-none"></div>

          <h2 className="text-xl font-black text-white mb-6 uppercase tracking-widest flex items-center gap-3">
            <span className="w-8 h-px bg-red-600"></span> Protocol Specs
          </h2>

          <div className="space-y-6 text-gray-400 font-light">
            <p className="leading-relaxed">
              Credentials mapped to the Web3 Student Lab are permanently minted
              on the Stellar blockchain via highly optimized Soroban smart
              contracts. This cryptographic attestation guarantees unforgeable
              proof-of-knowledge.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 border-t border-white/5 pt-8">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-black border border-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-white mb-1 uppercase tracking-wider text-sm">
                    Immutable
                  </h4>
                  <p className="text-xs text-gray-500">
                    Tamper-proof ledger encoding.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-black border border-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-white"
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
                <div>
                  <h4 className="font-bold text-white mb-1 uppercase tracking-wider text-sm">
                    Real-Time
                  </h4>
                  <p className="text-xs text-gray-500">
                    Sub-second global verification.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-black border border-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.5A2.5 2.5 0 0017.5 18h.5a2 2 0 012-2v-6a2 2 0 00-2-2h-1.064M5 20.5A2.5 2.5 0 002.5 18h-.5a2 2 0 01-2-2v-6a2 2 0 012-2h1.064"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-white mb-1 uppercase tracking-wider text-sm">
                    Decentralized
                  </h4>
                  <p className="text-xs text-gray-500">
                    Powered by Soroban Network.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
