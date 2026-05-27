'use client';

import { ANIMATION_TOKENS } from '@/lib/animations/animationTokens';
import { motion } from 'framer-motion';
import React from 'react';

interface LoadingAnimationProps {
  type?: 'spinner' | 'dots' | 'pulse' | 'bars' | 'skeleton';
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullscreen?: boolean;
  color?: string;
}

export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  type = 'spinner',
  size = 'md',
  text,
  fullscreen = false,
  color = 'text-purple-500',
}) => {
  const sizeMap = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const containerClass = fullscreen
    ? 'fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm'
    : 'flex flex-col items-center justify-center gap-3';

  if (fullscreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: ANIMATION_TOKENS.durations.micro }}
        className={containerClass}
      >
        <LoadingAnimation type={type} size="lg" text={text} color={color} />
      </motion.div>
    );
  }

  return (
    <div className={containerClass}>
      {type === 'spinner' && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration: ANIMATION_TOKENS.durations.long,
            repeat: Infinity,
            ease: 'linear',
          }}
          className={`${sizeMap[size]} ${color}`}
        >
          <svg
            className="h-full w-full"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </motion.div>
      )}

      {type === 'dots' && (
        <div className={`flex gap-1 ${sizeMap[size]}`}>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: ANIMATION_TOKENS.durations.normal,
                repeat: Infinity,
                delay: i * ANIMATION_TOKENS.durations.micro,
              }}
              className={`flex-1 rounded-full bg-current`}
            />
          ))}
        </div>
      )}

      {type === 'pulse' && (
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{
            duration: ANIMATION_TOKENS.durations.long,
            repeat: Infinity,
          }}
          className={`${sizeMap[size]} rounded-full bg-current ${color}`}
        />
      )}

      {type === 'bars' && (
        <div className={`flex items-end gap-1 ${sizeMap[size]}`}>
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              animate={{ scaleY: [0.5, 1, 0.5] }}
              transition={{
                duration: ANIMATION_TOKENS.durations.normal,
                repeat: Infinity,
                delay: i * ANIMATION_TOKENS.durations.micro,
              }}
              className={`h-full w-1 flex-1 rounded-full bg-current ${color}`}
            />
          ))}
        </div>
      )}

      {type === 'skeleton' && (
        <div className="w-full space-y-3">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: ANIMATION_TOKENS.durations.long,
                repeat: Infinity,
                delay: i * ANIMATION_TOKENS.durations.micro,
              }}
              className="h-4 rounded bg-gray-700"
            />
          ))}
        </div>
      )}

      {text && (
        <motion.p
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{
            duration: ANIMATION_TOKENS.durations.long,
            repeat: Infinity,
          }}
          className="text-sm text-gray-400"
        >
          {text}
        </motion.p>
      )}
    </div>
  );
};

// Inline loading state (for buttons, fields, etc)
export const InlineLoadingAnimation: React.FC<{
  size?: 'sm' | 'md';
  show?: boolean;
}> = ({ size = 'sm', show = true }) => {
  const sizeMap = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
  };

  if (!show) return null;

  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{
        duration: ANIMATION_TOKENS.durations.long,
        repeat: Infinity,
        ease: 'linear',
      }}
      className={`${sizeMap[size]} text-current`}
    >
      <svg
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </motion.div>
  );
};
