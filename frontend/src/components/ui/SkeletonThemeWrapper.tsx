'use client';

import React from 'react';
import { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

export function SkeletonThemeWrapper({ children }: { children: React.ReactNode }) {
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <SkeletonTheme
      baseColor="rgba(255,255,255,0.05)"
      highlightColor="rgba(255,255,255,0.1)"
      borderRadius="1rem"
      enableAnimation={!reducedMotion}
      duration={1.5}
    >
      {children}
    </SkeletonTheme>
  );
}
