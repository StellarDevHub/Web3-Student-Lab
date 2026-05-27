'use client';

import { motion } from 'framer-motion';

interface WizardNavigationProps {
  canGoBack: boolean;
  canProceed: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
}

export function WizardNavigation({
  canGoBack,
  canProceed,
  isFirstStep,
  isLastStep,
  onBack,
  onNext,
  onSubmit,
  isSubmitting = false,
}: WizardNavigationProps) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-800 pt-8">
      <motion.button
        whileHover={canGoBack ? { x: -4 } : {}}
        whileTap={canGoBack ? { scale: 0.95 } : {}}
        onClick={onBack}
        disabled={!canGoBack || isSubmitting}
        className={`flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium tracking-wider uppercase transition-all ${
          canGoBack && !isSubmitting
            ? 'border border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700'
            : 'cursor-not-allowed border border-zinc-800 bg-zinc-900 text-zinc-600'
        }`}
        type="button"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </motion.button>

      {isLastStep ? (
        <motion.button
          whileHover={canProceed ? { scale: 1.02 } : {}}
          whileTap={canProceed ? { scale: 0.98 } : {}}
          onClick={onSubmit}
          disabled={!canProceed || isSubmitting}
          className={`flex items-center gap-2 rounded-lg px-8 py-3 text-sm font-bold tracking-wider uppercase shadow-lg transition-all ${
            canProceed && !isSubmitting
              ? 'bg-red-600 text-white shadow-red-600/25 hover:bg-red-700'
              : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          }`}
          type="submit"
        >
          {isSubmitting ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
              Processing...
            </>
          ) : (
            <>
              Complete Enrollment
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </>
          )}
        </motion.button>
      ) : (
        <motion.button
          whileHover={canProceed ? { scale: 1.02 } : {}}
          whileTap={canProceed ? { scale: 0.98 } : {}}
          onClick={onNext}
          disabled={!canProceed || isSubmitting}
          className={`flex items-center gap-2 rounded-lg px-8 py-3 text-sm font-bold tracking-wider uppercase shadow-lg transition-all ${
            canProceed && !isSubmitting
              ? 'bg-white text-black shadow-white/10 hover:bg-zinc-200'
              : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          }`}
          type="button"
        >
          Continue
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </motion.button>
      )}
    </div>
  );
}
