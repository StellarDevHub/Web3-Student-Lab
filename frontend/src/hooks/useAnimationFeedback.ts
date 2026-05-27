'use client';

import { useCallback, useState } from 'react';

type FeedbackType = 'success' | 'error' | 'warning' | 'info';

interface AnimationFeedback {
  type: FeedbackType;
  message: string;
  duration?: number;
}

export function useAnimationFeedback() {
  const [feedback, setFeedback] = useState<AnimationFeedback | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const showFeedback = useCallback((type: FeedbackType, message: string, duration = 3000) => {
    setFeedback({ type, message, duration });
    setIsVisible(true);

    const timer = setTimeout(() => {
      setIsVisible(false);
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  const showSuccess = useCallback(
    (message: string, duration?: number) => {
      showFeedback('success', message, duration);
    },
    [showFeedback]
  );

  const showError = useCallback(
    (message: string, duration?: number) => {
      showFeedback('error', message, duration);
    },
    [showFeedback]
  );

  const showWarning = useCallback(
    (message: string, duration?: number) => {
      showFeedback('warning', message, duration);
    },
    [showFeedback]
  );

  const showInfo = useCallback(
    (message: string, duration?: number) => {
      showFeedback('info', message, duration);
    },
    [showFeedback]
  );

  const dismiss = useCallback(() => {
    setIsVisible(false);
  }, []);

  return {
    feedback,
    isVisible,
    showFeedback,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    dismiss,
  };
}

// Hook for loading states
export function useLoadingAnimation() {
  const [isLoading, setIsLoading] = useState(false);

  const startLoading = useCallback(() => setIsLoading(true), []);
  const stopLoading = useCallback(() => setIsLoading(false), []);

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | null> => {
      startLoading();
      try {
        const result = await fn();
        return result;
      } catch (error) {
        console.error('Loading animation error:', error);
        return null;
      } finally {
        stopLoading();
      }
    },
    [startLoading, stopLoading]
  );

  return {
    isLoading,
    startLoading,
    stopLoading,
    withLoading,
  };
}

// Hook for tap feedback
export function useTapFeedback() {
  const [isTapped, setIsTapped] = useState(false);

  const handleTapStart = useCallback(() => {
    setIsTapped(true);
  }, []);

  const handleTapEnd = useCallback(() => {
    setIsTapped(false);
  }, []);

  return {
    isTapped,
    handleTapStart,
    handleTapEnd,
  };
}
