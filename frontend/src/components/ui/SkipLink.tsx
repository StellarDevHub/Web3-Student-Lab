'use client';

import React, { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SkipLinkTarget {
  id: string;
  label: string;
}

export interface SkipLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  targets?: SkipLinkTarget[];
  mainContentId?: string;
  enableLiveRegion?: boolean;
  navAriaLabel?: string;
}

/**
 * Accessible ARIA 1.2 SkipLink Component (FE-078).
 *
 * Provides:
 * - Direct skip links for keyboard and screen reader users to jump past navigation
 *   to main content, compiler terminal, code editor, etc.
 * - ARIA 1.2 polite live region (`aria-live="polite"`, `aria-atomic="true"`) announcing
 *   successful focus jumps to assistive technologies.
 * - Robust focus management setting `tabIndex={-1}` on target elements and programmatic focusing.
 */
export function SkipLink({
  className,
  targets = [],
  mainContentId = 'main-content',
  children = 'Skip to main content',
  href,
  enableLiveRegion = true,
  navAriaLabel = 'Skip navigation links',
  onClick,
  ...props
}: SkipLinkProps) {
  const mainHref = href || `#${mainContentId}`;
  const [announcement, setAnnouncement] = useState<string>('');

  const handleSkipTo = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, targetId: string, label: string) => {
      // Allow custom onClick to execute first
      onClick?.(e);

      if (typeof document === 'undefined') return;

      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        // Ensure element can programmatically receive keyboard focus
        if (!targetEl.hasAttribute('tabIndex')) {
          targetEl.setAttribute('tabIndex', '-1');
        }
        if (typeof targetEl.focus === 'function') {
          targetEl.focus();
        }
        if (typeof targetEl.scrollIntoView === 'function') {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        if (enableLiveRegion) {
          setAnnouncement(`Navigated to ${label}`);
        }
      }
    },
    [onClick, enableLiveRegion]
  );

  const sharedLinkClasses = cn(
    'skip-link',
    'fixed -top-full left-0 z-[9999]',
    'px-4 py-3 rounded-br-xl',
    'bg-white text-gray-900 font-semibold text-sm',
    'shadow-lg',
    'focus:top-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-strong,#2563eb)]',
    className
  );

  if (targets.length === 0) {
    return (
      <>
        {enableLiveRegion && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
            data-testid="skip-link-live-region"
          >
            {announcement}
          </div>
        )}
        <a
          href={mainHref}
          className={sharedLinkClasses}
          onClick={(e) => handleSkipTo(e, mainContentId, typeof children === 'string' ? children : 'main content')}
          {...props}
        >
          {children}
        </a>
      </>
    );
  }

  return (
    <nav aria-label={navAriaLabel} className={cn('skip-link-group', className)}>
      {enableLiveRegion && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="skip-link-live-region"
        >
          {announcement}
        </div>
      )}
      <a
        href={mainHref}
        className={sharedLinkClasses}
        onClick={(e) => handleSkipTo(e, mainContentId, typeof children === 'string' ? children : 'main content')}
      >
        {children}
      </a>
      {targets.map((target, idx) => (
        <a
          key={target.id}
          href={`#${target.id}`}
          className={sharedLinkClasses}
          style={{ left: idx > 0 ? `${idx * 200}px` : '0' }}
          onClick={(e) => handleSkipTo(e, target.id, target.label)}
        >
          {target.label}
        </a>
      ))}
    </nav>
  );
}

export function SkipLinkTarget({
  id,
  className,
  children,
  as = 'div',
  'aria-label': ariaLabel,
  ...props
}: {
  id: string;
  as?: 'main' | 'section' | 'div' | 'nav' | 'aside';
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  const Component = as;
  return (
    <Component
      id={id}
      tabIndex={-1}
      aria-label={ariaLabel}
      className={cn('focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500/50', className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export default SkipLink;
