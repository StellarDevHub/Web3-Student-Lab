'use client';

import React, { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CopyToClipboardProps {
  /** The text content to copy to the clipboard */
  text: string;
  /** Optional children to override default icon button. If clicked, copies the text. */
  children?: React.ReactNode;
  /** Custom classes for the button */
  className?: string;
  /** Custom classes for the copy/check icon */
  iconClassName?: string;
  /** Optional callback triggered on copy success */
  onCopy?: () => void;
}

export function sanitizeTextForClipboard(input: string): string {
  if (!input) return '';
  // 1. Remove ANSI escape/color codes (e.g. from terminal output or logs)
  let cleaned = input.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  // 2. Remove unprintable control characters (excluding tab, carriage return, and newline)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  return cleaned;
}

export function CopyToClipboard({
  text,
  children,
  className,
  iconClassName,
  onCopy,
}: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const sanitizedText = sanitizeTextForClipboard(text);

    // 1. Try modern clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(sanitizedText);
        triggerSuccess();
        return;
      } catch (err) {
        console.warn('Modern clipboard API failed, falling back to legacy.', err);
      }
    }

    // 2. Legacy textarea fallback
    fallbackCopy(sanitizedText);
  };

  const fallbackCopy = (val: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = val;
      // Prevent scrolling page to bottom
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (success) {
        triggerSuccess();
      } else {
        console.error('Legacy copy command failed.');
      }
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
  };

  const triggerSuccess = () => {
    setCopied(true);

    // 3. Trigger haptic feedback (vibrate 50ms) on supported mobile devices
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch (e) {
        // Suppress vibrate security exception if user didn't interact directly or unsupported
      }
    }

    onCopy?.();
  };

  return (
    <div className="relative inline-flex items-center">
      {/* Tooltip feedback */}
      <div
        className={cn(
          'absolute bottom-full left-1/2 mb-2 -translate-x-1/2 scale-90 rounded-lg bg-neutral-900 border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-xl pointer-events-none transition-all duration-200 ease-out opacity-0 z-50',
          copied && 'opacity-100 scale-100 translate-y-[-2px]'
        )}
      >
        Copied!
        <div className="absolute top-full left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-0.5 rotate-45 border-r border-b border-white/10 bg-neutral-900" />
      </div>

      {children ? (
        <button
          type="button"
          onClick={handleCopy}
          className={cn('focus:outline-none', className)}
          aria-label="Copy to clipboard"
        >
          {children}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition-all hover:bg-white/10 hover:text-white active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-500/50',
            copied && 'border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 hover:text-green-300',
            className
          )}
          aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
        >
          <div className="relative h-4 w-4 flex items-center justify-center overflow-hidden">
            <span
              className={cn(
                'absolute transition-all duration-300 transform',
                copied ? 'scale-0 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'
              )}
            >
              <Copy className={cn('h-4 w-4', iconClassName)} />
            </span>
            <span
              className={cn(
                'absolute transition-all duration-300 transform',
                copied ? 'scale-100 rotate-0 opacity-100' : 'scale-0 -rotate-90 opacity-0'
              )}
            >
              <Check className={cn('h-4 w-4 text-green-400', iconClassName)} />
            </span>
          </div>
        </button>
      )}
    </div>
  );
}
