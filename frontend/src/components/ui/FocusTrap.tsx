'use client';

import React, { useRef } from 'react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export interface FocusTrapProps extends React.HTMLAttributes<HTMLDivElement> {
  enabled?: boolean;
  initialFocus?: boolean;
  returnFocusOnDeactivate?: boolean;
  onEscape?: () => void;
  children: React.ReactNode;
}

export function FocusTrap({
  className,
  enabled = true,
  initialFocus = true,
  returnFocusOnDeactivate = true,
  onEscape,
  children,
  ...props
}: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(containerRef, {
    enabled,
    initialFocus,
    returnFocusOnDeactivate,
    onEscape,
  });

  return (
    <div ref={containerRef} className={cn(className)} {...props}>
      {children}
    </div>
  );
}
