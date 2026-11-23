'use client';

import React from 'react';
import Joyride, { CallBackProps, STATUS, ACTIONS, EVENTS, TooltipRenderProps } from 'react-joyride';
import { CODE_TOUR_STEPS, CodeTourStep } from '@/constants/tourSteps';
import { useTourProgress } from '@/hooks/useTourProgress';

function GlassmorphismTooltip({
  continuous,
  index,
  step,
  isLastStep,
  backProps,
  primaryProps,
  skipProps,
  closeProps,
}: TooltipRenderProps) {
  const currentStep = step as CodeTourStep;

  return (
    <div className="relative max-w-md rounded-2xl border border-slate-700/70 bg-slate-900/95 p-6 text-slate-100 shadow-2xl backdrop-blur-xl">
      {/* Glow highlight */}
      <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300 border border-indigo-500/30">
          {currentStep.badge || `Step ${index + 1} of ${CODE_TOUR_STEPS.length}`}
        </span>
        <button
          {...skipProps}
          className="text-xs text-slate-400 hover:text-slate-200 transition"
        >
          Skip Tour
        </button>
      </div>

      {/* Title */}
      <h3 className="mt-3 text-base font-bold text-white">
        {currentStep.title}
      </h3>

      {/* Content */}
      <div className="mt-2 text-xs leading-relaxed text-slate-300">
        {step.content}
      </div>

      {/* Footer controls */}
      <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
        {index > 0 ? (
          <button
            {...backProps}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
          >
            Previous
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          {continuous && (
            <button
              {...primaryProps}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:bg-indigo-500"
            >
              {isLastStep ? 'Complete Tour ✓' : 'Next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CodeTour() {
  const {
    isInitialized,
    isActive,
    stepIndex,
    setStepIndex,
    completeTour,
    skipTour,
  } = useTourProgress();

  if (!isInitialized || !isActive) {
    return null;
  }

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { action, index, status, type } = data;

    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      completeTour();
    } else if (action === ACTIONS.CLOSE || action === ACTIONS.SKIP) {
      skipTour();
    } else if (type === EVENTS.STEP_AFTER) {
      setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
    }
  };

  return (
    <Joyride
      steps={CODE_TOUR_STEPS}
      run={isActive}
      stepIndex={stepIndex}
      continuous
      scrollToFirstStep
      showProgress
      showSkipButton
      disableOverlayClose
      callback={handleJoyrideCallback}
      tooltipComponent={GlassmorphismTooltip}
      styles={{
        options: {
          arrowColor: '#0f172a',
          overlayColor: 'rgba(5, 8, 22, 0.75)',
          zIndex: 10000,
        },
        spotlight: {
          borderRadius: 12,
        },
      }}
    />
  );
}
