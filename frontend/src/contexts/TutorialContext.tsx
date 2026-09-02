'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { Step } from 'react-joyride';
import { TutorialWalkthrough } from '@/components/tutorials/TutorialWalkthrough';
import {
  getTutorial,
  type TutorialDefinition,
  type TutorialId,
} from '@/components/tutorials/tutorialConfig';

const STORAGE_PREFIX = 'tutorial-completed-';

interface TutorialContextType {
  activeTutorial: TutorialId | null;
  isRunning: boolean;
  startTutorial: (id: TutorialId) => void;
  stopTutorial: () => void;
  hasCompletedTutorial: (id: TutorialId) => boolean;
  markTutorialCompleted: (id: TutorialId) => void;
  resetTutorial: (id: TutorialId) => void;
}

const TutorialContext = createContext<TutorialContextType | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [activeTutorial, setActiveTutorial] = useState<TutorialId | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const tutorialDefRef = useRef<TutorialDefinition | null>(null);

  const isRunning = activeTutorial !== null;

  const startTutorial = useCallback((id: TutorialId) => {
    const def = getTutorial(id);
    tutorialDefRef.current = def;
    setActiveTutorial(id);
    setStepIndex(0);
  }, []);

  const stopTutorial = useCallback(() => {
    setActiveTutorial(null);
    setStepIndex(0);
    tutorialDefRef.current = null;
  }, []);

  const hasCompletedTutorial = useCallback((id: TutorialId): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`${STORAGE_PREFIX}${id}`) === 'true';
  }, []);

  const markTutorialCompleted = useCallback((id: TutorialId) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${STORAGE_PREFIX}${id}`, 'true');
    }
  }, []);

  const resetTutorial = useCallback((id: TutorialId) => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
    }
  }, []);

  const handleFinish = useCallback(() => {
    if (activeTutorial) {
      markTutorialCompleted(activeTutorial);
    }
    stopTutorial();
  }, [activeTutorial, markTutorialCompleted, stopTutorial]);

  const handleSkip = useCallback(() => {
    stopTutorial();
  }, [stopTutorial]);

  const handleStepChange = useCallback((newStepIndex: number) => {
    setStepIndex(newStepIndex);
  }, []);

  const currentDef = tutorialDefRef.current;

  return (
    <TutorialContext.Provider
      value={{
        activeTutorial,
        isRunning,
        startTutorial,
        stopTutorial,
        hasCompletedTutorial,
        markTutorialCompleted,
        resetTutorial,
      }}
    >
      {children}

      {currentDef && activeTutorial && (
        <TutorialWalkthrough
          tutorialId={currentDef.id}
          steps={currentDef.steps}
          run={isRunning}
          stepIndex={stepIndex}
          onStepChange={handleStepChange}
          onFinish={handleFinish}
          onSkip={handleSkip}
        />
      )}
    </TutorialContext.Provider>
  );
}

export function useTutorial(): TutorialContextType {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
}
