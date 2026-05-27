'use client';

import { ANIMATION_TOKENS } from '@/lib/animations/animationTokens';
import { motion } from 'framer-motion';
import React, { InputHTMLAttributes } from 'react';

interface AnimatedInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  success?: string;
  icon?: React.ReactNode;
  showFeedback?: boolean;
}

export const AnimatedInput = React.forwardRef<HTMLInputElement, AnimatedInputProps>(
  ({ label, error, success, icon, showFeedback = true, className = '', ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const hasError = error && showFeedback;
    const hasSuccess = success && showFeedback;

    return (
      <div className="w-full">
        {label && (
          <motion.label
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: ANIMATION_TOKENS.durations.micro }}
            className="mb-2 block text-sm font-medium text-gray-300"
          >
            {label}
          </motion.label>
        )}

        <div className="relative">
          {icon && (
            <motion.div
              animate={{ scale: isFocused ? 1.05 : 1 }}
              transition={{ duration: ANIMATION_TOKENS.durations.micro }}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            >
              {icon}
            </motion.div>
          )}

          <motion.div
            animate={{
              borderColor: hasError
                ? '#dc2626'
                : hasSuccess
                  ? '#16a34a'
                  : isFocused
                    ? '#a78bfa'
                    : '#374151',
            }}
            transition={{ duration: ANIMATION_TOKENS.durations.micro }}
            className="rounded-lg border border-gray-700 bg-gray-900 transition-colors"
          >
            <input
              ref={ref}
              onFocus={(e) => {
                setIsFocused(true);
                props.onFocus?.(e);
              }}
              onBlur={(e) => {
                setIsFocused(false);
                props.onBlur?.(e);
              }}
              className={`w-full rounded-lg bg-transparent px-3 py-2 ${icon ? 'pl-10' : ''} text-white placeholder-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${className} `}
              {...props}
            />
          </motion.div>

          {/* Success indicator */}
          {hasSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: ANIMATION_TOKENS.durations.micro }}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-green-500"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </motion.div>
          )}

          {/* Error indicator */}
          {hasError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: 5 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: ANIMATION_TOKENS.durations.micro }}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-red-500"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </motion.div>
          )}
        </div>

        {/* Error message */}
        {hasError && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: ANIMATION_TOKENS.durations.micro }}
            className="mt-1 text-sm text-red-500"
          >
            {error}
          </motion.p>
        )}

        {/* Success message */}
        {hasSuccess && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: ANIMATION_TOKENS.durations.micro }}
            className="mt-1 text-sm text-green-500"
          >
            {success}
          </motion.p>
        )}
      </div>
    );
  }
);

AnimatedInput.displayName = 'AnimatedInput';
