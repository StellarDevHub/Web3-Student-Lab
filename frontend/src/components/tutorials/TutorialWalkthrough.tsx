'use client';

import React, { useCallback } from 'react';
let JoyrideModule: any;
try {
  JoyrideModule = require('react-joyride');
} catch (e) {}
const Joyride = (JoyrideModule?.default || JoyrideModule) as any;
type CallBackProps = any;
type Step = any;
const { STATUS = {}, EVENTS = {}, ACTIONS = {} } = JoyrideModule || {};
import { getTutorialStyles, type TutorialId } from './tutorialConfig';

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
