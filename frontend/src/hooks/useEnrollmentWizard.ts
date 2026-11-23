'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  EnrollmentWizardState,
  INITIAL_WIZARD_STATE,
  CourseSelection,
  PrerequisiteCheck,
  LearningGoals,
  StudySchedule,
  Confirmation,
  ValidationResult,
  CourseWithPrerequisites,
} from '@/lib/enrollment/types';
import { validateStep } from '@/lib/enrollment/validation';
import { wizardPersistence, mergeWithInitialState } from '@/lib/enrollment/WizardPersistence';

interface UseEnrollmentWizardOptions {
  course?: CourseWithPrerequisites;
  completedCourseIds?: string[];
  onComplete?: (state: EnrollmentWizardState) => void;
  onStepChange?: (step: number) => void;
}

interface UseEnrollmentWizardReturn {
  state: EnrollmentWizardState;
  currentStep: number;
  isComplete: boolean;
  validationResult: ValidationResult;
  canProceed: boolean;
  canGoBack: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  lastSaved: string | null;

  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => boolean;

  updateStep1: (data: Partial<CourseSelection>) => void;
  updateStep2: (data: Partial<PrerequisiteCheck>) => void;
  updateStep3: (data: Partial<LearningGoals>) => void;
  updateStep4: (data: Partial<StudySchedule>) => void;
  updateStep5: (data: Partial<Confirmation>) => void;

  validateCurrentStep: () => ValidationResult;
  clearErrors: () => void;
  reset: () => void;
  save: () => void;
  resume: () => boolean;
  clearSavedState: () => void;

  setValidationErrors: (errors: Record<string, string[]>) => void;
}

function getValidationStepKey(step: number): string {
  return `step${step}`;
}

function areErrorsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((error, index) => error === right[index]);
}

export function useEnrollmentWizard(
  options: UseEnrollmentWizardOptions = {}
): UseEnrollmentWizardReturn {
  const { course, completedCourseIds, onComplete, onStepChange } = options;

  const [state, setState] = useState<EnrollmentWizardState>(() => {
    const saved = wizardPersistence.load();
    return mergeWithInitialState(saved);
  });

  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  });

  const autoSaveStarted = useRef(false);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!autoSaveStarted.current) {
      autoSaveStarted.current = true;
      wizardPersistence.startAutoSave(
        () => stateRef.current,
        (savedState) => {
          setState((prev) => ({ ...prev, lastSaved: savedState.lastSaved }));
        }
      );
    }

    return () => {
      wizardPersistence.stopAutoSave();
    };
  }, []);

  useEffect(() => {
    wizardPersistence.save(state);
  }, [state]);

  const validateCurrentStep = useCallback((): ValidationResult => {
    const result = validateStep(state.currentStep, state.steps, course, completedCourseIds);
    setValidationResult(result);
    setState((prev) => ({
      ...prev,
      validationErrors: {
        ...prev.validationErrors,
        [getValidationStepKey(state.currentStep)]: result.errors,
      },
    }));
    return result;
  }, [state.currentStep, state.steps, course, completedCourseIds]);

  useEffect(() => {
    const result = validateStep(state.currentStep, state.steps, course, completedCourseIds);
    setValidationResult((prev) => {
      if (prev.isValid === result.isValid && areErrorsEqual(prev.errors, result.errors)) {
        return prev;
      }
      return result;
    });

    setState((prev) => {
      const stepKey = getValidationStepKey(prev.currentStep);
      const currentErrors = prev.validationErrors[stepKey] || [];

      if (areErrorsEqual(currentErrors, result.errors)) {
        return prev;
      }

      return {
        ...prev,
        validationErrors: {
          ...prev.validationErrors,
          [stepKey]: result.errors,
        },
      };
    });
  }, [state.currentStep, state.steps, course, completedCourseIds]);

  const canProceed = validationResult.isValid;
  const canGoBack = state.currentStep > 1;
  const isFirstStep = state.currentStep === 1;
  const isLastStep = state.currentStep === state.totalSteps;

  const setStep = useCallback(
    (step: number) => {
      if (step >= 1 && step <= state.totalSteps) {
        setState((prev) => ({ ...prev, currentStep: step }));
        onStepChange?.(step);
      }
    },
    [state.totalSteps, onStepChange]
  );

  const nextStep = useCallback(() => {
    const result = validateCurrentStep();
    if (result.isValid && state.currentStep < state.totalSteps) {
      const next = state.currentStep + 1;
      setState((prev) => ({ ...prev, currentStep: next }));
      onStepChange?.(next);
    }
  }, [state.currentStep, state.totalSteps, validateCurrentStep, onStepChange]);

  const prevStep = useCallback(() => {
    if (state.currentStep > 1) {
      const prev = state.currentStep - 1;
      setState((s) => ({ ...s, currentStep: prev }));
      onStepChange?.(prev);
    }
  }, [state.currentStep, onStepChange]);

  const goToStep = useCallback(
    (step: number): boolean => {
      if (step < 1 || step > state.totalSteps) return false;

      for (let i = 1; i < step; i++) {
        const result = validateStep(i, state.steps, course, completedCourseIds);
        if (!result.isValid) return false;
      }

      setStep(step);
      return true;
    },
    [state.totalSteps, state.steps, course, completedCourseIds, setStep]
  );

  const updateStep1 = useCallback((data: Partial<CourseSelection>) => {
    setState((prev) => ({
      ...prev,
      steps: {
        ...prev.steps,
        step1_courseSelection: { ...prev.steps.step1_courseSelection, ...data },
      },
    }));
  }, []);

  const updateStep2 = useCallback((data: Partial<PrerequisiteCheck>) => {
    setState((prev) => ({
      ...prev,
      steps: {
        ...prev.steps,
        step2_prerequisites: { ...prev.steps.step2_prerequisites, ...data },
      },
    }));
  }, []);

  const updateStep3 = useCallback((data: Partial<LearningGoals>) => {
    setState((prev) => ({
      ...prev,
      steps: {
        ...prev.steps,
        step3_goals: { ...prev.steps.step3_goals, ...data },
      },
    }));
  }, []);

  const updateStep4 = useCallback((data: Partial<StudySchedule>) => {
    setState((prev) => ({
      ...prev,
      steps: {
        ...prev.steps,
        step4_schedule: { ...prev.steps.step4_schedule, ...data },
      },
    }));
  }, []);

  const updateStep5 = useCallback((data: Partial<Confirmation>) => {
    setState((prev) => ({
      ...prev,
      steps: {
        ...prev.steps,
        step5_confirmation: { ...prev.steps.step5_confirmation, ...data },
      },
    }));
  }, []);

  const clearErrors = useCallback(() => {
    setValidationResult({ isValid: true, errors: [] });
    setState((prev) => ({
      ...prev,
      validationErrors: {},
    }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_WIZARD_STATE);
    clearErrors();
    wizardPersistence.clear();
  }, [clearErrors]);

  const save = useCallback(() => {
    wizardPersistence.save(state);
  }, [state]);

  const resume = useCallback((): boolean => {
    const saved = wizardPersistence.load();
    if (saved && !saved.isComplete) {
      setState(mergeWithInitialState(saved));
      return true;
    }
    return false;
  }, []);

  const clearSavedState = useCallback(() => {
    wizardPersistence.clear();
  }, []);

  const setValidationErrors = useCallback((errors: Record<string, string[]>) => {
    setState((prev) => ({
      ...prev,
      validationErrors: errors,
    }));
  }, []);

  useEffect(() => {
    if (state.isComplete && onComplete) {
      onComplete(state);
    }
  }, [state.isComplete, state, onComplete]);

  return {
    state,
    currentStep: state.currentStep,
    isComplete: state.isComplete,
    validationResult,
    canProceed,
    canGoBack,
    isFirstStep,
    isLastStep,
    lastSaved: state.lastSaved,

    setStep,
    nextStep,
    prevStep,
    goToStep,

    updateStep1,
    updateStep2,
    updateStep3,
    updateStep4,
    updateStep5,

    validateCurrentStep,
    clearErrors,
    reset,
    save,
    resume,
    clearSavedState,

    setValidationErrors,
  };
}
