'use client';

import React, { useState, useId } from 'react';
import { Share2, Check, Copy, ExternalLink, X } from 'lucide-react';

export interface SocialShareButtonsProps {
  certificateId: string;
  studentName: string;
  courseTitle?: string;
  certificateHash?: string;
  completionDate?: string;
  className?: string;
  showModalTrigger?: boolean;
}

export function SocialShareButtons({
  certificateId,
  studentName,
  courseTitle = 'Soroban Smart Contract Developer',
  certificateHash,
  completionDate,
  className = '',
  showModalTrigger = false,
}: SocialShareButtonsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const modalId = useId();

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://web3studentlab.dev';
  const certificateUrl = `${baseUrl}/certificates/${certificateId}`;
  
  const ogImageUrl = `${baseUrl}/api/og/certificate/${certificateId}?studentName=${encodeURIComponent(
    studentName
  )}&course=${encodeURIComponent(courseTitle)}&date=${encodeURIComponent(
    completionDate || new Date().toISOString().split('T')[0]
  )}${certificateHash ? `&hash=${encodeURIComponent(certificateHash)}` : ''}`;

  const shareText = `I just earned my verified completion certificate for "${courseTitle}" on @StellarOrg Web3 Student Lab! 🎓🚀 #Web3 #Stellar #Soroban #Rust`;

  const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText
  )}&url=${encodeURIComponent(certificateUrl)}`;

  const linkedInShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    certificateUrl
  )}`;

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(certificateUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const buttonsGroup = (
    <div className={`flex flex-wrap items-center gap-3 ${className}`} data-testid="social-share-buttons">
      {/* Twitter Intent Button */}
      <a
        href={twitterIntentUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share certificate on Twitter / X"
        data-testid="share-twitter-btn"
        className="inline-flex items-center gap-2 rounded-xl bg-black border border-white/20 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-zinc-800 hover:border-white/40 focus:outline-none focus:ring-2 focus:ring-red-500"
      >
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <span>Share on X</span>
        <ExternalLink className="h-3 w-3 text-zinc-400" aria-hidden="true" />
      </a>

      {/* LinkedIn Intent Button */}
      <a
        href={linkedInShareUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share certificate on LinkedIn"
        data-testid="share-linkedin-btn"
        className="inline-flex items-center gap-2 rounded-xl bg-[#0A66C2] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#004182] focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c.92 0 1.66-.74 1.66-1.66 0-.91-.74-1.65-1.66-1.65-.92 0-1.66.74-1.66 1.65 0 .92.74 1.66 1.66 1.66m1.39 9.74v-8.37H5.07v8.37h2.78z" />
        </svg>
        <span>Post to LinkedIn</span>
        <ExternalLink className="h-3 w-3 text-blue-200" aria-hidden="true" />
      </a>

      {/* Copy Link Button */}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Link copied' : 'Copy certificate link'}
        data-testid="share-copy-btn"
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span className="text-emerald-400">Copied!</span>
          </>
        ) : (
          <>
            <Copy className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            <span>Copy Link</span>
          </>
        )}
      </button>
    </div>
  );

  if (!showModalTrigger) {
    return buttonsGroup;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
        aria-haspopup="dialog"
        aria-expanded={isModalOpen}
        data-testid="open-share-modal-btn"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        <span>Share Credential</span>
      </button>

      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${modalId}-title`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <h2 id={`${modalId}-title`} className="text-base font-bold text-white">
                Share Certificate
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="my-5">
              <p className="text-xs text-zinc-400 mb-4">
                Share your blockchain-verified achievement on social platforms with high-fidelity OpenGraph preview.
              </p>
              
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 mb-5 overflow-hidden">
                <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1">
                  Edge OpenGraph Preview URL
                </span>
                <span className="block truncate font-mono text-xs text-red-400">
                  {ogImageUrl}
                </span>
              </div>

              {buttonsGroup}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SocialShareButtons;
