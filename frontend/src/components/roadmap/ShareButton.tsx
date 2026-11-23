'use client';

import { useState } from 'react';

interface ShareButtonProps {
  title: string;
  description: string;
}

export default function ShareButton({ title, description }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const text = encodeURIComponent(`${title} — ${description}`);
  const url = typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : '';

  const twitterUrl = `https://twitter.com/intent/tweet?text=${text}`;
  const linkedInUrl = `https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=${encodeURIComponent(title)}`;

  function handleCopy() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const btnClass =
    'flex-1 rounded border border-white/10 bg-zinc-950 py-1.5 text-xs font-mono tracking-widest text-gray-400 transition-colors hover:border-white/20 hover:text-white uppercase';

  return (
    <div className="mt-3 flex gap-2">
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          window.open(twitterUrl, '_blank', 'noopener,noreferrer');
        }}
        className={btnClass}
      >
        X
      </a>
      <a
        href={linkedInUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          window.open(linkedInUrl, '_blank', 'noopener,noreferrer');
        }}
        className={btnClass}
      >
        in
      </a>
      <button onClick={handleCopy} className={btnClass}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
