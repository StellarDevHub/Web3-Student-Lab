import { useState, useEffect, useCallback } from 'react';

const TOUR_STORAGE_KEY = 'web3_lab_code_tour_completed';
const TOUR_STEP_KEY = 'web3_lab_code_tour_step';

export function useTourProgress() {
  const [isCompleted, setIsCompleted] = useState<boolean>(true);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const completed = localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
      setIsCompleted(completed);

      // Auto-trigger for first time visitors
      if (!completed) {
        setIsActive(true);
        const savedStep = localStorage.getItem(TOUR_STEP_KEY);
        if (savedStep) {
          const parsed = parseInt(savedStep, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            setStepIndex(parsed);
          }
        }
      }
    } catch {
      // Storage error fallback
    } finally {
      setIsInitialized(true);
    }
  }, []);

  const completeTour = useCallback(() => {
    setIsActive(false);
    setIsCompleted(true);
    setStepIndex(0);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      localStorage.removeItem(TOUR_STEP_KEY);
    } catch {}
  }, []);

  const skipTour = useCallback(() => {
    setIsActive(false);
    setIsCompleted(true);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      localStorage.removeItem(TOUR_STEP_KEY);
    } catch {}
  }, []);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setIsActive(true);
  }, []);

  const resetTour = useCallback(() => {
    try {
      localStorage.removeItem(TOUR_STORAGE_KEY);
      localStorage.removeItem(TOUR_STEP_KEY);
    } catch {}
    setIsCompleted(false);
    setStepIndex(0);
    setIsActive(true);
  }, []);

  const changeStep = useCallback((index: number) => {
    setStepIndex(index);
    try {
      localStorage.setItem(TOUR_STEP_KEY, String(index));
    } catch {}
  }, []);

  return {
    isInitialized,
    isCompleted,
    isActive,
    stepIndex,
    startTour,
    skipTour,
    completeTour,
    resetTour,
    setStepIndex: changeStep,
  };
}
