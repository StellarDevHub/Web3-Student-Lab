'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Certificate, certificatesAPI } from '@/lib/api';
import { truncateHash } from '@/lib/certificate-generator';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function CertificatesVaultPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
      return;
    }

    async function loadVault() {
      try {
        const data = await certificatesAPI.getByStudentId(user!.id);
        setCertificates(data);
      } catch (error) {
        console.error('Failed to load vault:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadVault();
  }, [user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-black">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-red-600/30 border-t-red-600"></div>
          <p className="font-mono text-sm tracking-widest text-red-500 uppercase">
            Decrypting Vault...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black p-8 text-white md:p-12">
      {/* Background Effect */}
      <div className="pointer-events-none absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-red-600/10 blur-[100px]"></div>

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-12 border-l-4 border-red-600 py-2 pl-6">
          <h1 className="mb-2 text-4xl font-black tracking-tight uppercase md:text-5xl">
            Cryptographic <span className="text-red-500">Vault</span>
          </h1>
          <p className="font-mono text-lg text-sm font-light tracking-wide text-gray-400 uppercase">
            Stored assets for Operator: <span className="text-white">{user?.name}</span>
          </p>
        </div>

        {certificates.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-12 text-center shadow-[0_0_30px_rgba(220,38,38,0.05)]">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-black">
              <svg
                className="h-8 w-8 text-gray-600"
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
            <h2 className="mb-4 text-2xl font-black tracking-widest text-white uppercase">
              Vault Empty
            </h2>
            <p className="mx-auto mb-8 max-w-md text-gray-500">
              No cryptographic tokens found on-chain for this operator. Connect to a learning node
              to begin extracting credentials.
            </p>
            <Link
              href="/courses"
              className="inline-block rounded-xl bg-white px-8 py-4 font-black tracking-widest text-black uppercase shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-colors hover:bg-gray-200"
            >
              Scan Nodes
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {certificates.map((cert) => (
              <Link
                key={cert.id}
                href={`/certificates/${cert.id}`}
                className="group relative block overflow-hidden rounded-2xl border border-red-500/20 bg-zinc-950 p-8 shadow-[0_0_20px_rgba(220,38,38,0.05)] transition-all hover:border-red-500/60 hover:shadow-[0_0_40px_rgba(220,38,38,0.2)]"
              >
                <div className="pointer-events-none absolute top-0 right-0 h-32 w-32 rounded-bl-full bg-red-900/10 transition-colors group-hover:bg-red-900/30"></div>
                <div className="relative z-10 mb-8 flex items-start justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-black shadow-inner">
                    <svg
                      className="h-8 w-8 text-red-500 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                      />
                    </svg>
                  </div>
                  <div className="text-right">
                    <span className="mb-1 block text-[10px] tracking-widest text-gray-500 uppercase">
                      Mint Date
                    </span>
                    <span className="rounded border border-white/10 bg-black px-3 py-1.5 font-mono text-xs text-gray-300">
                      {new Date(cert.issuedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <h2 className="mb-2 text-2xl leading-tight font-black tracking-tight text-white uppercase transition-colors group-hover:text-red-50">
                  {cert.course?.title || 'Unknown Protocol'}
                </h2>
                <div className="mb-6 truncate font-mono text-sm text-red-500/80">
                  TX: {cert.certificateHash ? truncateHash(cert.certificateHash, 8) : 'PENDING'}
                </div>

                <div className="flex items-center justify-between border-t border-white/10 pt-6">
                  <span className="text-xs font-bold tracking-widest text-gray-500 uppercase transition-colors group-hover:text-gray-300">
                    Web3 Lab Identity
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(`/certificates/generate?id=${cert.id}`);
                      }}
                      className="text-xs font-bold tracking-widest text-red-600 uppercase transition-colors hover:text-red-400"
                    >
                      Download ↓
                    </button>
                    <span className="flex items-center gap-1 text-xs font-bold tracking-widest text-red-500 uppercase group-hover:text-red-400">
                      Inspect{' '}
                      <span className="transform transition-transform group-hover:translate-x-1">
                        →
                      </span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
