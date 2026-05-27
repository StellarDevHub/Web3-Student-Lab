'use client';

import {
  CertificateData,
  buildExplorerUrl,
  drawCryptoStamp,
  truncateHash,
} from '@/lib/certificate-generator';
import { useEffect, useRef } from 'react';

interface Props {
  data: CertificateData;
  /** If true, renders at full resolution for download */
  forExport?: boolean;
}

export default function CertificateTemplate({ data, forExport = false }: Props) {
  const stampRef = useRef<HTMLCanvasElement>(null);

  // Draw the crypto stamp on the canvas overlay
  useEffect(() => {
    const canvas = stampRef.current;
    if (!canvas) return;
    canvas.width = 140;
    canvas.height = 140;
    drawCryptoStamp(canvas, data.transactionHash, 70, 70, 60);
  }, [data.transactionHash]);

  const formattedDate = data.issueDate
    ? new Date(data.issueDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  const explorerUrl = buildExplorerUrl(data.transactionHash);

  return (
    <div
      id="certificate-template"
      className={`relative overflow-hidden bg-zinc-950 select-none ${
        forExport ? 'h-[848px] w-[1200px]' : 'aspect-[1200/848] w-full'
      }`}
      style={{ fontFamily: 'Georgia, serif' }}
    >
      {/* Background gradient layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-950" />
      <div className="absolute top-0 left-0 h-[600px] w-[600px] rounded-full bg-red-900/10 blur-[120px]" />
      <div className="absolute right-0 bottom-0 h-[400px] w-[400px] rounded-full bg-red-800/8 blur-[100px]" />

      {/* Outer border frame */}
      <div className="pointer-events-none absolute inset-4 rounded-xl border border-red-600/30" />
      <div className="pointer-events-none absolute inset-6 rounded-xl border border-white/5" />

      {/* Corner ornaments */}
      <CornerOrnament position="top-left" />
      <CornerOrnament position="top-right" />
      <CornerOrnament position="bottom-left" />
      <CornerOrnament position="bottom-right" />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-between px-16 py-10">
        {/* Header */}
        <div className="text-center">
          <div className="mb-2 flex items-center justify-center gap-3">
            <div className="h-px w-8 bg-red-600/60" />
            <span className="font-mono text-xs tracking-[0.3em] text-red-500 uppercase">
              Web3 Student Lab
            </span>
            <div className="h-px w-8 bg-red-600/60" />
          </div>
          <p className="font-mono text-[10px] tracking-[0.4em] text-gray-500 uppercase">
            Blockchain-Verified Certificate of Completion
          </p>
        </div>

        {/* Main body */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="font-sans text-sm tracking-[0.25em] text-gray-400 uppercase">
            This certifies that
          </p>

          {/* Recipient name */}
          <div className="relative">
            <h1
              className="text-5xl leading-none font-black tracking-tight text-white"
              style={{ fontFamily: 'Georgia, serif', textShadow: '0 0 40px rgba(220,38,38,0.3)' }}
            >
              {data.recipientName || 'Student Name'}
            </h1>
            <div className="mt-2 h-px bg-gradient-to-r from-transparent via-red-600/60 to-transparent" />
          </div>

          <p className="font-sans text-sm tracking-[0.25em] text-gray-400 uppercase">
            has successfully completed
          </p>

          {/* Course name */}
          <h2
            className="max-w-2xl text-center text-3xl leading-tight font-bold tracking-wide text-red-400 uppercase"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {data.courseName || 'Course Name'}
          </h2>

          {/* Issue date */}
          <p className="mt-2 font-mono text-sm tracking-widest text-gray-500">
            Issued on {formattedDate}
          </p>
        </div>

        {/* Footer row */}
        <div className="flex w-full items-end justify-between">
          {/* Instructor signature */}
          <div className="min-w-[180px] text-center">
            <div className="mb-2 h-px bg-white/20" />
            <p className="text-sm font-bold tracking-wider text-white">
              {data.instructorName || 'Instructor'}
            </p>
            <p className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
              Course Instructor
            </p>
          </div>

          {/* Crypto stamp canvas */}
          <div className="flex flex-col items-center gap-1">
            <canvas ref={stampRef} className="h-[70px] w-[70px]" />
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[8px] tracking-widest text-red-500/70 transition-colors hover:text-red-400"
              onClick={(e) => e.stopPropagation()}
            >
              {truncateHash(data.transactionHash, 8)}
            </a>
          </div>

          {/* Certificate ID */}
          <div className="min-w-[180px] text-center">
            <div className="mb-2 h-px bg-white/20" />
            <p className="font-mono text-sm font-bold tracking-wider text-white">
              {data.certificateId ? data.certificateId.slice(0, 12).toUpperCase() : '—'}
            </p>
            <p className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
              Certificate ID
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CornerOrnament({
  position,
}: {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}) {
  const posClass = {
    'top-left': 'top-8 left-8',
    'top-right': 'top-8 right-8 rotate-90',
    'bottom-left': 'bottom-8 left-8 -rotate-90',
    'bottom-right': 'bottom-8 right-8 rotate-180',
  }[position];

  return (
    <div className={`absolute ${posClass} pointer-events-none h-8 w-8`}>
      <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
        <path d="M2 30 L2 2 L30 2" stroke="rgba(220,38,38,0.5)" strokeWidth="1.5" fill="none" />
        <path d="M2 2 L8 2" stroke="rgba(220,38,38,0.9)" strokeWidth="2" />
        <path d="M2 2 L2 8" stroke="rgba(220,38,38,0.9)" strokeWidth="2" />
      </svg>
    </div>
  );
}
