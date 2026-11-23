'use client';

import { motion } from 'framer-motion';

interface WizardProgressProps {
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[];
}

const DEFAULT_STEP_LABELS = [
  'Course Selection',
  'Prerequisites',
  'Learning Goals',
  'Schedule',
  'Confirmation',
];

export function WizardProgress({
  currentStep,
  totalSteps,
  stepLabels = DEFAULT_STEP_LABELS,
}: WizardProgressProps) {
  const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-between">
        {stepLabels.map((label, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const isPending = stepNumber > currentStep;

          return (
            <div
              key={stepNumber}
              className="flex flex-col items-center"
              style={{ width: `${100 / totalSteps}%` }}
            >
              <motion.div
                initial={false}
                animate={{
                  scale: isCurrent ? 1.1 : 1,
                  backgroundColor: isCompleted ? '#16a34a' : isCurrent ? '#dc2626' : '#27272a',
                }}
                className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold ${
                  isCompleted
                    ? 'border-green-600 text-white'
                    : isCurrent
                      ? 'border-red-600 text-white'
                      : 'border-zinc-700 text-zinc-500'
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  stepNumber
                )}
              </motion.div>
              <span
                className={`hidden text-center text-xs font-medium sm:block ${
                  isCurrent ? 'text-red-500' : isCompleted ? 'text-green-500' : 'text-zinc-500'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-zinc-800">
        <motion.div
          className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-red-600 to-red-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        />
      </div>

      <div className="mt-2 flex justify-between font-mono text-xs text-zinc-500">
        <span>
          Step {currentStep} of {totalSteps}
        </span>
        <span>{Math.round(progress)}% Complete</span>
      </div>
    </div>
  );
}
