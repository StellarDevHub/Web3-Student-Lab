import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';

/**
 * Hook to prefetch Next.js routes based on hover intent
 * This helps in making navigation feel instantaneous
 */
export const usePrefetch = () => {
  const router = useRouter();
  const prefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const prefetch = useCallback(
    (href: string) => {
      if (href.startsWith('/') && !href.startsWith('http')) {
        router.prefetch(href);
      }
    },
    [router]
  );

  const handleMouseEnter = useCallback(
    (href: string) => {
      // Small delay to avoid prefetching on accidental hover
      prefetchTimeoutRef.current = setTimeout(() => {
        prefetch(href);
      }, 50);
    },
    [prefetch]
  );

  const handleMouseLeave = useCallback(() => {
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current);
      prefetchTimeoutRef.current = null;
    }
  }, []);

  return {
    prefetch,
    handleMouseEnter,
    handleMouseLeave,
  };
};
