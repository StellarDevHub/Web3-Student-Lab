'use client';

import CertificateTemplate from '@/components/certificates/CertificateTemplate';
import { useAuth } from '@/contexts/AuthContext';
import { Certificate, certificatesAPI } from '@/lib/api';
import {
  buildLinkedInShareUrl,
  CertificateData,
  downloadCertificateAsPdf,
  downloadCertificateAsPng,
} from '@/lib/certificate-generator';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function CertificateGeneratorInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const certId = searchParams?.get('id');

  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [isLoading, setIsLoading] = useState(!!certId);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'pdf'>('png');

  // Editable fields for live preview
  const [formData, setFormData] = useState<CertificateData>({
    recipientName: '',
    courseName: '',
    issueDate: new Date().toISOString(),
    transactionHash: '',
    certificateId: '',
    instructorName: 'Web3 Lab Team',
  });

  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
      return;
    }

    if (certId) {
      certificatesAPI
        .getById(certId)
        .then((cert) => {
          setCertificate(cert);
          setFormData({
            recipientName: cert.student?.name || user.name || '',
            courseName: cert.course?.title || '',
            issueDate: cert.issuedAt,
            transactionHash: cert.certificateHash || '',
            certificateId: cert.id,
            instructorName: cert.course?.instructor || 'Web3 Lab Team',
          });
        })
        .catch(() => router.push('/certificates'))
        .finally(() => setIsLoading(false));
    } else {
      // Manual mode — pre-fill with user name
      setFormData((prev) => ({ ...prev, recipientName: user.name || '' }));
      setIsLoading(false);
    }
  }, [certId, user, router]);

  const handleField = (field: keyof CertificateData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const filename = `certificate-${formData.recipientName.replace(/\s+/g, '-').toLowerCase()}`;
      if (downloadFormat === 'pdf') {
        await downloadCertificateAsPdf('certificate-template', filename);
      } else {
        await downloadCertificateAsPng('certificate-template', filename);
      }
    } catch (err) {
      console.error('Download failed:', err);
      alert('Download failed. Make sure html2canvas and jspdf are installed.');
    } finally {
      setIsDownloading(false);
    }
  };

  const linkedInUrl = buildLinkedInShareUrl(formData);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600/30 border-t-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="border-l-4 border-red-600 pl-5">
            <h1 className="text-3xl font-black tracking-tight uppercase">
              Certificate <span className="text-red-500">Generator</span>
            </h1>
            <p className="mt-1 font-mono text-xs tracking-widest text-gray-500 uppercase">
              {certificate ? `Loaded from vault · ${certificate.id.slice(0, 12)}` : 'Manual mode'}
            </p>
          </div>
          <Link
            href="/certificates"
            className="group flex items-center gap-2 text-xs font-bold tracking-widest text-gray-500 uppercase transition-colors hover:text-red-500"
          >
            <span className="inline-block transition-transform group-hover:-translate-x-1">←</span>
            Back to Vault
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_380px]">
          {/* Live Preview */}
          <div className="space-y-3">
            <p className="font-mono text-[10px] tracking-[0.3em] text-gray-500 uppercase">
              Live Preview
            </p>
            <div className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_60px_rgba(220,38,38,0.08)]">
              <CertificateTemplate data={formData} />
            </div>
            <p className="text-center font-mono text-[10px] text-gray-600">
              Updates in real-time as you edit the fields →
            </p>
          </div>

          {/* Controls panel */}
          <div className="space-y-6">
            {/* Fields */}
            <div className="space-y-4 rounded-2xl border border-white/10 bg-zinc-950 p-6">
              <h3 className="border-b border-white/10 pb-3 text-xs font-bold tracking-widest text-gray-400 uppercase">
                Certificate Details
              </h3>

              <Field
                label="Recipient Name"
                value={formData.recipientName}
                onChange={(v) => handleField('recipientName', v)}
                placeholder="Full name"
                readOnly={!!certificate}
              />
              <Field
                label="Course Name"
                value={formData.courseName}
                onChange={(v) => handleField('courseName', v)}
                placeholder="Course title"
                readOnly={!!certificate}
              />
              <Field
                label="Instructor"
                value={formData.instructorName || ''}
                onChange={(v) => handleField('instructorName', v)}
                placeholder="Instructor name"
              />
              <Field
                label="Issue Date"
                value={formData.issueDate ? formData.issueDate.slice(0, 10) : ''}
                onChange={(v) => handleField('issueDate', v)}
                type="date"
                readOnly={!!certificate}
              />
            </div>

            {/* Blockchain info */}
            <div className="space-y-4 rounded-2xl border border-white/10 bg-zinc-950 p-6">
              <h3 className="border-b border-white/10 pb-3 text-xs font-bold tracking-widest text-gray-400 uppercase">
                Cryptographic Signature
              </h3>

              <div>
                <label className="mb-1.5 block font-mono text-[10px] tracking-widest text-gray-500 uppercase">
                  Stellar Transaction Hash
                </label>
                <input
                  value={formData.transactionHash}
                  onChange={(e) => handleField('transactionHash', e.target.value)}
                  readOnly={!!certificate?.certificateHash}
                  placeholder="Paste tx hash or leave blank"
                  className="w-full rounded-lg border border-white/10 bg-black px-3 py-2.5 font-mono text-xs text-red-400 placeholder-gray-700 transition-colors focus:border-red-600/50 focus:outline-none"
                />
              </div>

              {formData.transactionHash && (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${formData.transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 font-mono text-[10px] text-red-500/70 transition-colors hover:text-red-400"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                  View on Stellar Explorer →
                </a>
              )}
            </div>

            {/* Download & Share */}
            <div className="space-y-4 rounded-2xl border border-white/10 bg-zinc-950 p-6">
              <h3 className="border-b border-white/10 pb-3 text-xs font-bold tracking-widest text-gray-400 uppercase">
                Export & Share
              </h3>

              {/* Format toggle */}
              <div className="flex gap-2">
                {(['png', 'pdf'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setDownloadFormat(fmt)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-bold tracking-widest uppercase transition-colors ${
                      downloadFormat === fmt
                        ? 'border-red-600 bg-red-600 text-white'
                        : 'border-white/10 bg-black text-gray-500 hover:border-white/30'
                    }`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Download button */}
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className={`w-full rounded-xl py-3.5 text-sm font-black tracking-widest uppercase transition-all ${
                  isDownloading
                    ? 'cursor-wait bg-zinc-800 text-gray-500'
                    : 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:bg-gray-100'
                }`}
              >
                {isDownloading ? 'Rendering...' : `Download ${downloadFormat.toUpperCase()}`}
              </button>

              {/* LinkedIn share */}
              <a
                href={linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0077B5] py-3.5 text-sm font-black tracking-widest text-white uppercase transition-colors hover:bg-[#006399]"
              >
                <LinkedInIcon />
                Add to LinkedIn
              </a>
            </div>

            {/* Hash info box */}
            {formData.transactionHash && (
              <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4">
                <p className="mb-1 font-mono text-[10px] tracking-widest text-red-400/80 uppercase">
                  On-Chain Record
                </p>
                <p className="font-mono text-[10px] leading-relaxed break-all text-gray-500">
                  {formData.transactionHash}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[10px] tracking-widest text-gray-500 uppercase">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-black px-3 py-2.5 text-sm text-white placeholder-gray-700 transition-colors focus:outline-none ${
          readOnly
            ? 'cursor-default border-white/5 text-gray-400'
            : 'border-white/10 focus:border-red-600/50'
        }`}
      />
    </div>
  );
}

function LinkedInIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export default function CertificateGeneratorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-black">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600/30 border-t-red-600" />
        </div>
      }
    >
      <CertificateGeneratorInner />
    </Suspense>
  );
}
