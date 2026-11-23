'use client';

import React, { useState, useMemo } from 'react';
import { useBulkCertificateExport } from '@/hooks/useBulkCertificateExport';
import type { CertificateItem } from '@/workers/bulk-certificate.worker';

interface BulkExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCertificates?: CertificateItem[];
}

export function BulkExporterModal({
  isOpen,
  onClose,
  initialCertificates,
}: BulkExporterModalProps) {
  const {
    startExport,
    cancelExport,
    downloadZip,
    reset,
    isExporting,
    progress,
    result,
    error,
  } = useBulkCertificateExport();

  const [courseFilter, setCourseFilter] = useState('Soroban Smart Contract Developer');
  const [sampleCount, setSampleCount] = useState<number>(100);

  // Generate sample certificates if not passed
  const certificatesToExport = useMemo<CertificateItem[]>(() => {
    if (initialCertificates && initialCertificates.length > 0) {
      return initialCertificates;
    }

    const items: CertificateItem[] = [];
    const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Sam', 'Riley', 'Avery', 'Dakota', 'Reese'];
    const lastNames = ['Vance', 'Sterling', 'Chen', 'Okoro', 'Dubois', 'Novak', 'Gupta', 'Silva', 'Mendoza', 'Kowalski'];

    for (let i = 1; i <= sampleCount; i++) {
      const fn = firstNames[(i - 1) % firstNames.length];
      const ln = lastNames[Math.floor((i - 1) / 10) % lastNames.length];
      items.push({
        id: `CERT-2026-${String(i).padStart(4, '0')}`,
        recipientName: `${fn} ${ln}`,
        courseName: courseFilter,
        issueDate: '2026-10-20',
        transactionHash: `9a8f4c7b2e1d0a5f8c3b6e9a1d4f7c2b5e8a0d3f6c9b2e5a8d1f4c7b2e1d0a5f`,
        instructorName: 'Dr. Stellar Core',
        grade: i % 5 === 0 ? 'Distinction (100%)' : 'Pass (with Honors)',
      });
    }
    return items;
  }, [initialCertificates, sampleCount, courseFilter]);

  if (!isOpen) return null;

  const handleStart = () => {
    startExport(certificatesToExport);
  };

  const handleClose = () => {
    if (isExporting) {
      cancelExport();
    }
    reset();
    onClose();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 sm:p-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-xl font-bold text-white">
              Bulk Certificate QR Generator & ZIP Exporter
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Web-worker accelerated generation: creates verified QR codes, watermarked SVGs, PDFs, and metadata packages without UI freeze.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Body content */}
        {!result && (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-400">Target Cohort:</span>
                  <span className="ml-1.5 font-semibold text-slate-200">{courseFilter}</span>
                </div>
                <div>
                  <span className="text-slate-400">Certificates in Batch:</span>
                  <span className="ml-1.5 font-mono font-bold text-indigo-400">
                    {certificatesToExport.length} packages
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <span>Total files generated:</span>
                <span className="font-semibold text-slate-200">
                  {certificatesToExport.length * 3} files (.pdf, .svg, .json)
                </span>
              </div>
            </div>

            {/* In-progress bar */}
            {isExporting && (
              <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-indigo-300">
                    Processing {progress.currentName || 'Certificates'} ({progress.current}/{progress.total})
                  </span>
                  <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 font-mono text-[11px] text-indigo-300">
                    ETA: {progress.etaSeconds}s remaining
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300 ease-out"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Main thread non-blocking Web Worker</span>
                  <span className="font-mono">{progress.percentage}% Complete</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Completed state */}
        {result && (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                ✓
              </div>
              <h4 className="mt-2 text-base font-bold text-white">ZIP Package Generated!</h4>
              <p className="mt-1 text-xs text-slate-300">
                Successfully processed {result.totalCertificates} certificates in {(result.durationMs / 1000).toFixed(2)} seconds.
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-emerald-500/20 pt-3 text-xs">
                <div>
                  <span className="text-slate-400">Total Packages</span>
                  <p className="font-mono font-bold text-slate-200">{result.totalCertificates}</p>
                </div>
                <div>
                  <span className="text-slate-400">Files Archived</span>
                  <p className="font-mono font-bold text-slate-200">{result.fileCount}</p>
                </div>
                <div>
                  <span className="text-slate-400">Archive Size</span>
                  <p className="font-mono font-bold text-slate-200">
                    {formatFileSize(result.zipBlob.size)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
          <button
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition"
          >
            {result ? 'Done' : 'Cancel'}
          </button>

          {!result ? (
            <button
              onClick={handleStart}
              disabled={isExporting}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {isExporting ? 'Generating In Background...' : 'Generate 100 Packages & Export ZIP'}
            </button>
          ) : (
            <button
              onClick={() => downloadZip(`certificates_${courseFilter.replace(/\s+/g, '_')}.zip`)}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:bg-emerald-500"
            >
              Download ZIP Archive ⇩
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
