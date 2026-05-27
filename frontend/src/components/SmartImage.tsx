'use client';

import Image, { ImageProps } from 'next/image';
import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ImageStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface SmartImageProps extends Omit<
  ImageProps,
  'placeholder' | 'blurDataURL' | 'onLoad' | 'onError'
> {
  /** Base64 LQIP string – generated server-side (see generateLQIP util) */
  blurDataURL?: string;
  /** Shown when the image fails to load */
  fallbackSrc?: string;
  /** Custom fallback element – overrides fallbackSrc */
  fallbackElement?: React.ReactNode;
  /** Threshold (0–1) for the IntersectionObserver */
  observerThreshold?: number;
  /** Root margin for the IntersectionObserver */
  observerRootMargin?: string;
  /** Whether to skip lazy-loading (e.g. above-the-fold hero images) */
  eager?: boolean;
  /** Extra class applied to the wrapper <div> */
  wrapperClassName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tiny transparent 1×1 GIF – used as placeholder when no LQIP is provided.
 * Prevents layout shift while keeping the image slot reserved.
 */
const TRANSPARENT_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Converts an ordinary image URL to its WebP/AVIF equivalent when served by a
 * CDN that supports format negotiation via query params (e.g. Cloudinary, imgix).
 *
 * Next.js's built-in `<Image>` already performs format negotiation via its own
 * optimisation pipeline, so this helper is primarily useful for external `src`
 * strings that bypass the Next.js loader.
 *
 * Override this function to match your CDN's API.
 */
export function toModernFormat(src: string, format: 'webp' | 'avif'): string {
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;
  try {
    const url = new URL(src, 'https://placeholder.local');
    url.searchParams.set('fm', format);
    // If the URL has a real host, return the full URL; otherwise strip the base.
    return url.hostname === 'placeholder.local' ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return src;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * SmartImage
 *
 * A drop-in replacement for Next.js <Image> that adds:
 *  1. Blurred LQIP placeholders (base64 blur-up effect)
 *  2. WebP / AVIF format support via <picture> for external sources
 *  3. IntersectionObserver-based lazy loading for long-scroll pages
 *  4. Graceful fallback states (skeleton → loaded | error)
 */
export function SmartImage({
  src,
  alt,
  width,
  height,
  fill,
  sizes,
  quality = 85,
  priority,
  blurDataURL,
  fallbackSrc,
  fallbackElement,
  observerThreshold = 0.1,
  observerRootMargin = '200px',
  eager = false,
  className = '',
  wrapperClassName = '',
  style,
  ...rest
}: SmartImageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ImageStatus>('idle');
  const [isVisible, setIsVisible] = useState<boolean>(eager || !!priority);
  const [activeSrc, setActiveSrc] = useState<ImageProps['src']>(src);

  // ── IntersectionObserver ──────────────────────────────────────────────────

  useEffect(() => {
    if (eager || priority || isVisible) return;

    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: observerThreshold, rootMargin: observerRootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [eager, priority, isVisible, observerThreshold, observerRootMargin]);

  // ── Src sync ─────────────────────────────────────────────────────────────

  useEffect(() => {
    setActiveSrc(src);
    setStatus('idle');
  }, [src]);

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleLoadStart = useCallback(() => setStatus('loading'), []);

  const handleLoad = useCallback(() => setStatus('loaded'), []);

  const handleError = useCallback(() => {
    if (fallbackSrc && activeSrc !== fallbackSrc) {
      setActiveSrc(fallbackSrc);
    } else {
      setStatus('error');
    }
  }, [fallbackSrc, activeSrc]);

  // ── Derived values ────────────────────────────────────────────────────────

  const lqip = blurDataURL ?? TRANSPARENT_PLACEHOLDER;
  const showBlur = status !== 'loaded' && status !== 'error';
  const showFallback = status === 'error';

  // Wrapper dimensions – honour both fill and explicit w/h modes.
  const wrapperStyle: React.CSSProperties = fill
    ? { position: 'relative', width: '100%', height: '100%', ...style }
    : { position: 'relative', display: 'inline-block', ...style };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      className={`smart-image-wrapper ${wrapperClassName}`}
      style={wrapperStyle}
      aria-busy={status === 'loading'}
    >
      {/* ── Skeleton / blur overlay ───────────────────────────────────────── */}
      {showBlur && (
        <div
          aria-hidden="true"
          className="smart-image-skeleton"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            overflow: 'hidden',
            borderRadius: 'inherit',
            transition: 'opacity 0.4s ease',
            opacity: (status as ImageStatus) === 'loaded' ? 0 : 1,
          }}
        >
          {/* Blurred LQIP preview */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lqip}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: blurDataURL ? 'blur(20px) saturate(1.2)' : 'none',
              transform: 'scale(1.05)', // hide blur edges
            }}
          />
          {/* Shimmer overlay when no LQIP is available */}
          {!blurDataURL && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'smartimage-shimmer 1.6s infinite',
              }}
            />
          )}
        </div>
      )}

      {/* ── Fallback element ──────────────────────────────────────────────── */}
      {showFallback && (
        <div
          role="img"
          aria-label={alt}
          className="smart-image-fallback"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(128,128,128,0.1)',
            borderRadius: 'inherit',
          }}
        >
          {fallbackElement ?? (
            <span style={{ fontSize: '0.75rem', color: 'rgba(128,128,128,0.8)' }}>
              Image unavailable
            </span>
          )}
        </div>
      )}

      {/* ── Actual image (lazy via isVisible gate) ────────────────────────── */}
      {isVisible && !showFallback && (
        <Image
          {...rest}
          src={activeSrc}
          alt={alt}
          width={!fill ? width : undefined}
          height={!fill ? height : undefined}
          fill={fill}
          sizes={sizes}
          quality={quality}
          priority={priority}
          // Use blur placeholder when we have an LQIP; otherwise empty.
          placeholder={blurDataURL ? 'blur' : 'empty'}
          blurDataURL={blurDataURL}
          onLoadStart={handleLoadStart}
          onLoad={handleLoad}
          onError={handleError}
          className={className}
          style={{
            transition: 'opacity 0.4s ease',
            opacity: status === 'loaded' ? 1 : 0,
            ...(fill ? {} : { display: 'block' }),
          }}
        />
      )}

      {/* ── Global keyframe (injected once) ──────────────────────────────── */}
      <style>{`
        @keyframes smartimage-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

// ─── LQIP generator utility ───────────────────────────────────────────────────

/**
 * generateLQIP
 *
 * Call this in a Next.js Server Component or `getStaticProps` to produce a
 * tiny base64 placeholder that ships with the page HTML – zero extra requests.
 *
 * Requirements: `sharp` must be installed (`npm i sharp`).
 *
 * @example
 * // app/courses/[id]/page.tsx (Server Component)
 * import { generateLQIP } from "@/components/SmartImage";
 *
 * const lqip = await generateLQIP("./public/images/course-hero.jpg");
 * return <SmartImage src="/images/course-hero.jpg" blurDataURL={lqip} ... />;
 */
export async function generateLQIP(imagePath: string): Promise<string> {
  // Dynamic import keeps `sharp` out of client bundles.
  const sharp = (await import('sharp')).default;

  const buffer = await sharp(imagePath)
    .resize(16, 16, { fit: 'inside' }) // 16 × 16 thumbnail
    .webp({ quality: 20 })
    .toBuffer();

  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

// ─── Picture wrapper for external / CDN images ────────────────────────────────

interface SmartPictureProps extends SmartImageProps {
  /** Explicitly opt-in to <picture> with WebP/AVIF <source> tags.
   *  Useful for external images not processed by the Next.js image pipeline. */
  useModernFormats?: boolean;
}

/**
 * SmartPicture
 *
 * Wraps SmartImage with an HTML <picture> element that supplies WebP and AVIF
 * <source> alternatives for external image URLs not processed by Next.js.
 *
 * For images served through Next.js's own optimisation pipeline (i.e. images
 * in /public or fetched through the `/_next/image` endpoint), you do NOT need
 * this wrapper – Next.js handles format negotiation automatically.
 */
export function SmartPicture({ src, useModernFormats = true, ...props }: SmartPictureProps) {
  if (!useModernFormats || typeof src !== 'string') {
    return <SmartImage src={src} {...props} />;
  }

  const avifSrc = toModernFormat(src, 'avif');
  const webpSrc = toModernFormat(src, 'webp');

  // If format conversion didn't change the URL (e.g. src is a local path),
  // fall through to the standard SmartImage.
  if (avifSrc === src && webpSrc === src) {
    return <SmartImage src={src} {...props} />;
  }

  return (
    <picture>
      <source srcSet={avifSrc} type="image/avif" />
      <source srcSet={webpSrc} type="image/webp" />
      <SmartImage src={src} {...props} />
    </picture>
  );
}

// ─── Lazy-load observer hook (standalone, for arbitrary DOM elements) ─────────

/**
 * useLazyVisible
 *
 * Returns a [ref, isVisible] tuple. Attach `ref` to any element; `isVisible`
 * flips to `true` once it enters the viewport. Useful for deferring heavy
 * renders (video, iframes, maps) on long-scrolling pages.
 *
 * @example
 * const [ref, isVisible] = useLazyVisible<HTMLDivElement>();
 * return <div ref={ref}>{isVisible && <HeavyComponent />}</div>;
 */
export function useLazyVisible<T extends Element>(
  options: IntersectionObserverInit = {}
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const { threshold = 0.1, rootMargin = '200px', root } = options;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin, root }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [options]);

  return [ref, isVisible];
}
