'use client';

import axios from 'axios';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEnrollmentWizard } from '@/hooks/useEnrollmentWizard';
import { WizardProgress } from './WizardProgress';
import { WizardNavigation } from './WizardNavigation';
import { Step1CourseSelection } from './Step1CourseSelection';
import { Step2Prerequisites } from './Step2Prerequisites';
import { Step3Goals } from './Step3Goals';
import { Step4Schedule } from './Step4Schedule';
import { Step5Confirmation } from './Step5Confirmation';
import { enrollmentsAPI, Enrollment } from '@/lib/api';
import { CourseWithPrerequisites } from '@/lib/enrollment/types';
import { useNotifications } from '@/contexts/NotificationContext';

interface EnrollmentWizardProps {
  studentId?: string;
  initialCourseId?: string;
  initialCourseTitle?: string;
  initialCourseCredits?: number;
  coursePrerequisites?: string[];
  completedCourseIds?: string[];
  onComplete?: (enrollment: Enrollment) => void;
}

export function EnrollmentWizard({
  studentId,
  initialCourseId,
  initialCourseTitle,
  initialCourseCredits,
  coursePrerequisites = [],
  completedCourseIds = [],
  onComplete,
}: EnrollmentWizardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const { push } = useNotifications();

  const course: CourseWithPrerequisites | undefined = initialCourseId
    ? {
        id: initialCourseId,
        title: initialCourseTitle || '',
        credits: initialCourseCredits || 0,
        prerequisites: coursePrerequisites,
        instructor: '',
        estimatedHours: 40,
        difficulty: 'intermediate',
      }
    : undefined;

  const wizard = useEnrollmentWizard({
    course,
    completedCourseIds,
  });

  const resolveEnrollmentError = useCallback((error: unknown): string => {
    if (axios.isAxiosError(error)) {
      const apiMessage = error.response?.data?.error;

      if (error.response?.status === 404) {
        return apiMessage === 'Student or course not found'
          ? 'Enrollment could not be completed because your learner profile or selected course could not be found. Please complete your profile and reselect the course.'
          : apiMessage || 'The requested enrollment resource could not be found.';
      }

      return apiMessage || error.message || 'Failed to complete enrollment. Please try again.';
    }

    return error instanceof Error
      ? error.message
      : 'Failed to complete enrollment. Please try again.';
  }, []);

  const handleSubmit = async () => {
    const validation = wizard.validateCurrentStep();
    if (!validation.isValid) return;

    const selectedCourseId = wizard.state.steps.step1_courseSelection.selectedCourseId;

    if (!studentId || !selectedCourseId) {
      const message = !studentId
        ? 'Your learner profile is not ready yet. Please complete registration before enrolling.'
        : 'Please select a course before completing enrollment.';
      setSubmitError(message);
      push({
        type: 'error',
        title: 'Enrollment blocked',
        message,
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    push({
      type: 'enrollment',
      title: 'Enrollment in progress',
      message: 'Submitting your enrollment request now.',
    });

    try {
      const enrollment = await enrollmentsAPI.enroll(studentId, selectedCourseId);

      wizard.clearSavedState();
      push({
        type: 'enrollment',
        title: 'Enrollment complete',
        message: 'Your course enrollment was completed successfully.',
      });
      onComplete?.(enrollment);
    } catch (error) {
      const message = resolveEnrollmentError(error);
      setSubmitError(message);
      push({
        type: 'error',
        title: 'Enrollment failed',
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStepErrors = useCallback(
    (step: number): string[] => {
      return wizard.state.validationErrors[`step${step}`] || [];
    },
    [wizard.state.validationErrors]
  );

  const renderCurrentStep = () => {
    const stepProps = {
      errors: getStepErrors(wizard.currentStep),
    };

    switch (wizard.currentStep) {
      case 1:
        return (
          <Step1CourseSelection
            data={wizard.state.steps.step1_courseSelection}
            onUpdate={wizard.updateStep1}
            {...stepProps}
          />
        );
      case 2:
        return (
          <Step2Prerequisites
            data={wizard.state.steps.step2_prerequisites}
            onUpdate={wizard.updateStep2}
            coursePrerequisites={coursePrerequisites}
            completedCourseIds={completedCourseIds}
            {...stepProps}
          />
        );
      case 3:
        return (
          <Step3Goals
            data={wizard.state.steps.step3_goals}
            onUpdate={wizard.updateStep3}
            {...stepProps}
          />
        );
      case 4:
        return (
          <Step4Schedule
            data={wizard.state.steps.step4_schedule}
            onUpdate={wizard.updateStep4}
            {...stepProps}
          />
        );
      case 5:
        return (
          <Step5Confirmation
            data={wizard.state.steps.step5_confirmation}
            wizardState={wizard.state}
            onUpdate={wizard.updateStep5}
            {...stepProps}
          />
        );
      default:
        return null;
    }
  };

  const stepTitles = [
    'Course Selection',
    'Prerequisites Check',
    'Learning Goals',
    'Schedule Planning',
    'Confirmation',
  ];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <AnimatePresence mode="wait">
        {showResumePrompt ? (
          <motion.div
            key="resume"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8"
          >
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                <svg
                  className="h-8 w-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="mb-2 text-2xl font-black text-white">Resume Enrollment?</h2>
              <p className="mb-6 text-zinc-400">
                You have an unfinished enrollment from{' '}
                {wizard.lastSaved ? new Date(wizard.lastSaved).toLocaleDateString() : 'previously'}.
                Would you like to continue where you left off?
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => {
                    wizard.resume();
                    setShowResumePrompt(false);
                  }}
                  className="rounded-lg bg-red-600 px-6 py-3 font-medium text-white transition-colors hover:bg-red-700"
                >
                  Resume
                </button>
                <button
                  onClick={() => {
                    wizard.reset();
                    setShowResumePrompt(false);
                  }}
                  className="rounded-lg bg-zinc-800 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
                >
                  Start Fresh
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="wizard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
          >
            <div className="border-b border-zinc-800 bg-zinc-900/50 p-6">
              <WizardProgress
                currentStep={wizard.currentStep}
                totalSteps={5}
                stepLabels={stepTitles}
              />
            </div>

            <div className="min-h-[400px] p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={wizard.currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderCurrentStep()}
                </motion.div>
              </AnimatePresence>
            </div>

            {submitError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-6 mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4"
              >
                <p className="flex items-center gap-2 text-sm text-red-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {submitError}
                </p>
              </motion.div>
            )}

            <div className="border-t border-zinc-800 bg-zinc-900/30 p-6">
              <WizardNavigation
                canGoBack={wizard.canGoBack}
                canProceed={wizard.validationResult.isValid}
                isFirstStep={wizard.isFirstStep}
                isLastStep={wizard.isLastStep}
                onBack={wizard.prevStep}
                onNext={() => {
                  const result = wizard.validateCurrentStep();
                  if (!result.isValid) {
                    push({
                      type: 'error',
                      title: 'Step needs attention',
                      message:
                        result.errors[0] || 'Please fix the highlighted fields before continuing.',
                    });
                    return;
                  }
                  wizard.nextStep();
                  push({
                    type: 'system',
                    title: 'Step saved',
                    message: `Moved to step ${Math.min(wizard.currentStep + 1, 5)} of 5.`,
                  });
                }}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
              />
            </div>

            {wizard.lastSaved && (
              <div className="px-6 pb-4 text-center">
                <p className="text-xs text-zinc-600">
                  Auto-saved: {new Date(wizard.lastSaved).toLocaleTimeString()}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
