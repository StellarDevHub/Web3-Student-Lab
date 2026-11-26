'use client';

import React, { useCallback } from 'react';
import * as JoyrideNamespace from 'react-joyride';
import { getTutorialStyles, type TutorialId } from './tutorialConfig';

/**
 * React 19 compatibility: react-joyride ships CJS with a `default` export that
 * may be wrapped as `{ default: Component }` depending on the bundler/interop.
 * Normalize to the actual component so it is never passed as an object element.
 */
const resolveInterop = <T,>(mod: any, key?: string): T => {
  let current = mod;
  // Unwrap nested default exports (CJS/ESM interop)
  for (let i = 0; i < 3 && current && typeof current === 'object' && 'default' in current; i++) {
    current = current.default;
  }
  if (key && current && typeof current === 'object' && key in current) {
    return current[key] as T;
  }
  return current as T;
};

const Joyride = resolveInterop<any>(JoyrideNamespace, undefined);
const JOYRIDE_CONSTANTS: any = (JoyrideNamespace as any).STATUS
  ? JoyrideNamespace
  : (JoyrideNamespace as any).default ?? {};
const STATUS: Record<string, string> = JOYRIDE_CONSTANTS.STATUS ?? {};
const EVENTS: Record<string, string> = JOYRIDE_CONSTANTS.EVENTS ?? {};
const ACTIONS: Record<string, string> = JOYRIDE_CONSTANTS.ACTIONS ?? {};

type CallBackProps = any;
type Step = any;

export interface TutorialWalkthroughProps {
  tutorialId: TutorialId;
  steps: Step[];
  run: boolean;
  stepIndex: number;
  onStepChange: (stepIndex: number) => void;
  onFinish: () => void;
  onSkip: () => void;
  continuous?: boolean;
  showProgress?: boolean;
  showSkipButton?: boolean;
  locale?: Record<string, string>;
}

export function TutorialWalkthrough({
  tutorialId,
  steps,
  run,
  stepIndex,
  onStepChange,
  onFinish,
  onSkip,
  continuous = true,
  showProgress = true,
  showSkipButton = true,
  locale = {
    last: 'FINISH',
    back: 'BACK',
    next: 'NEXT',
    skip: 'SKIP',
    close: 'CLOSE',
  },
}: TutorialWalkthroughProps) {
  const handleCallback = useCallback(
    (data: CallBackProps) => {
      const { action, index, status, type } = data;

      if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
        if (status === STATUS.FINISHED) {
          onFinish();
        } else {
          onSkip();
        }
        return;
      }

      if (
        [EVENTS.STEP_AFTER, EVENTS.TARGET_NOT_FOUND].includes(type) ||
        status === STATUS.ERROR
      ) {
        const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
        if (nextIndex >= 0 && nextIndex < steps.length) {
          onStepChange(nextIndex);
        } else if (nextIndex >= steps.length) {
          onFinish();
        }
      }
    },
    [onFinish, onSkip, onStepChange, steps.length]
  );

  const styles = getTutorialStyles();

  if (!Joyride || (typeof Joyride !== 'function' && typeof Joyride !== 'object')) {
    return null;
  }

  return (
    <Joyride
      key={tutorialId}
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous={continuous}
      showProgress={showProgress}
      showSkipButton={showSkipButton}
      callback={handleCallback}
      locale={locale}
      styles={styles}
      disableOverlayClose={true}
      hideCloseButton={false}
      data-testid="tutorial-walkthrough"
    />
  );
}
