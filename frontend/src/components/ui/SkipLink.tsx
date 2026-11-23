'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface SkipLinkTarget {
  id: string;
  label: string;
}

export interface SkipLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  targets?: SkipLinkTarget[];
  mainContentId?: string;
}

export function SkipLink({
  className,
  targets = [],
  mainContentId = 'main-content',
  children = 'Skip to main content',
  href,
  ...props
}: SkipLinkProps) {
  const mainHref = href || `#${mainContentId}`;

  if (targets.length === 0) {
    return (
      <a
        href={mainHref}
        className={cn(
          'skip-link',
          'fixed -top-full left-0 z-[9999]',
          'px-4 py-3 rounded-br-xl',
          'bg-white text-gray-900 font-semibold text-sm',
          'shadow-lg',
          'focus:top-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-strong)]',
          className
        )}
        {...props}
      >
        {children}
      </a>
    );
  }

  return (
    <div className={cn('skip-link-group', className)} {...props}>
      <a
        href={mainHref}
        className="skip-link fixed -top-full left-0 z-[9999] px-4 py-3 rounded-br-xl bg-white text-gray-900 font-semibold text-sm shadow-lg focus:top-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-strong)]"
      >
        {children}
      </a>
      {targets.map((target) => (
        <a
          key={target.id}
          href={`#${target.id}`}
          className="skip-link fixed -top-full left-0 z-[9999] px-4 py-3 rounded-br-xl bg-white text-gray-900 font-semibold text-sm shadow-lg focus:top-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-strong)]"
          style={{ left: targets.indexOf(target) > 0 ? `${targets.indexOf(target) * 200}px` : '0' }}
        >
          {target.label}
        </a>
      ))}
    </div>
  );
}

export function SkipLinkTarget({
  id,
  className,
  children,
  as = 'main',
  ...props
}: {
  id: string;
  as?: 'main' | 'section' | 'div' | 'nav' | 'aside';
  children: React.ReactNode;
  className?: string;
}) {
  const Component = as;
  return (
    <Component
      id={id}
      tabIndex={-1}
      className={cn('focus:outline-none', className)}
      {...props}
    >
      {children}
    </Component>
  );
}
