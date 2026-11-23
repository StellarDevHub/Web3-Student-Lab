'use client';

import { ANIMATION_TOKENS } from '@/lib/animations/animationTokens';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle, X } from 'lucide-react';
import React, { useEffect } from 'react';

interface FeedbackAnimationProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
  onDismiss?: () => void;
  autoClose?: boolean;
}

const feedbackStyles = {
  success: {
    bg: 'bg-green-900',
    border: 'border-green-700',
    text: 'text-green-100',
    icon: CheckCircle,
  },
  error: {
    bg: 'bg-red-900',
    border: 'border-red-700',
    text: 'text-red-100',
    icon: AlertCircle,
  },
  warning: {
    bg: 'bg-amber-900',
    border: 'border-amber-700',
    text: 'text-amber-100',
    icon: AlertCircle,
  },
  info: {
    bg: 'bg-blue-900',
    border: 'border-blue-700',
    text: 'text-blue-100',
    icon: AlertCircle,
  },
};

export const FeedbackAnimation: React.FC<FeedbackAnimationProps> = ({
  type,
  message,
  duration = 3000,
  onDismiss,
  autoClose = true,
}) => {
  const [isVisible, setIsVisible] = React.useState(true);
  const style = feedbackStyles[type];
  const IconComponent = style.icon;

  useEffect(() => {
    if (!autoClose || !isVisible) return;

    const timer = setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [autoClose, duration, isVisible, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{
            duration: ANIMATION_TOKENS.durations.short,
            ease: ANIMATION_TOKENS.easing.easeOut,
          }}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 backdrop-blur-sm ${style.bg} ${style.border} ${style.text}`}
        >
          <motion.div
            initial={
              type === 'success'
                ? { scale: 0, rotate: -45 }
                : type === 'error'
                  ? { x: 0 }
                  : { scale: 0 }
            }
            animate={
              type === 'success'
                ? { scale: 1, rotate: 0 }
                : type === 'error'
                  ? { x: [-5, 5, -5, 0] }
                  : { scale: 1 }
            }
            transition={{
              duration: ANIMATION_TOKENS.durations.normal,
              ease: ANIMATION_TOKENS.easing.easeOut,
            }}
            className="flex-shrink-0"
          >
            <IconComponent className="h-5 w-5" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: ANIMATION_TOKENS.durations.normal,
              delay: ANIMATION_TOKENS.durations.micro,
            }}
            className="flex-1 text-sm font-medium"
          >
            {message}
          </motion.p>

          <motion.button
            onClick={handleDismiss}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="flex-shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Inline feedback for form fields or actions
export const InlineFeedbackAnimation: React.FC<{
  type: 'success' | 'error';
  message: string;
  duration?: number;
  onDismiss?: () => void;
}> = ({ type, message, duration = 2000, onDismiss }) => {
  const [isVisible, setIsVisible] = React.useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const isSuccess = type === 'success';

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -10 }}
          animate={
            isSuccess
              ? { opacity: 1, scale: 1, y: 0 }
              : {
                  opacity: 1,
                  scale: 1,
                  y: 0,
                  x: [0, -5, 5, -5, 0],
                }
          }
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{
            duration: ANIMATION_TOKENS.durations.normal,
            ease: ANIMATION_TOKENS.easing.easeOut,
          }}
          className={`flex items-center gap-2 rounded px-3 py-2 text-sm font-medium ${
            isSuccess ? 'bg-green-900 text-green-100' : 'bg-red-900 text-red-100'
          }`}
        >
          <motion.div
            animate={isSuccess ? { scale: [1, 1.2, 1] } : { rotate: [0, -5, 5, -5, 0] }}
            transition={{
              duration: ANIMATION_TOKENS.durations.short,
            }}
          >
            {isSuccess ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          </motion.div>
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
