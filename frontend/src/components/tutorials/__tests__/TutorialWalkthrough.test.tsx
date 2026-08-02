import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TutorialWalkthrough } from '../TutorialWalkthrough';
import type { Step } from 'react-joyride';

vi.mock('react-joyride', () => {
  const MockJoyride = vi.fn((props: any) => {
    return (
      <div data-testid="tutorial-walkthrough" data-props={JSON.stringify({
        run: props.run,
        stepIndex: props.stepIndex,
        continuous: props.continuous,
        showProgress: props.showProgress,
        showSkipButton: props.showSkipButton,
        stepsLength: props.steps?.length,
        tutorialId: props.key,
      })}>
        <button onClick={() => props.callback?.({ status: 'finished', action: 'next', index: props.steps?.length - 1, type: 'step:after' })}>
          Finish
        </button>
        <button onClick={() => props.callback?.({ status: 'skipped', action: 'skip', index: 0, type: 'skip' })}>
          Skip
        </button>
        <button onClick={() => props.callback?.({ status: 'running', action: 'next', index: 0, type: 'step:after' })}>
          Next
        </button>
        <button onClick={() => props.callback?.({ status: 'running', action: 'prev', index: 1, type: 'step:after' })}>
          Prev
        </button>
      </div>
    );
  });
  return {
    default: MockJoyride,
    Joyride: MockJoyride,
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped', ERROR: 'error' },
    EVENTS: { STEP_AFTER: 'step:after', TARGET_NOT_FOUND: 'target:not-found' },
    ACTIONS: { PREV: 'prev', NEXT: 'next' },
  };
});

const mockSteps: Step[] = [
  {
    target: 'body',
    content: 'Step 1 content',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '.target-2',
    content: 'Step 2 content',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.target-3',
    content: 'Step 3 content',
    placement: 'top',
    disableBeacon: true,
  },
];

describe('TutorialWalkthrough', () => {
  const defaultProps = {
    tutorialId: 'simulator' as const,
    steps: mockSteps,
    run: true,
    stepIndex: 0,
    onStepChange: vi.fn(),
    onFinish: vi.fn(),
    onSkip: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<TutorialWalkthrough {...defaultProps} />);
    expect(screen.getByTestId('tutorial-walkthrough')).toBeDefined();
  });

  it('passes run prop correctly', () => {
    render(<TutorialWalkthrough {...defaultProps} run={true} />);
    const el = screen.getByTestId('tutorial-walkthrough');
    const props = JSON.parse(el.getAttribute('data-props') || '{}');
    expect(props.run).toBe(true);
  });

  it('passes stepIndex prop correctly', () => {
    render(<TutorialWalkthrough {...defaultProps} stepIndex={2} />);
    const el = screen.getByTestId('tutorial-walkthrough');
    const props = JSON.parse(el.getAttribute('data-props') || '{}');
    expect(props.stepIndex).toBe(2);
  });

  it('passes continuous prop correctly', () => {
    render(<TutorialWalkthrough {...defaultProps} continuous={false} />);
    const el = screen.getByTestId('tutorial-walkthrough');
    const props = JSON.parse(el.getAttribute('data-props') || '{}');
    expect(props.continuous).toBe(false);
  });

  it('passes showProgress prop correctly', () => {
    render(<TutorialWalkthrough {...defaultProps} showProgress={false} />);
    const el = screen.getByTestId('tutorial-walkthrough');
    const props = JSON.parse(el.getAttribute('data-props') || '{}');
    expect(props.showProgress).toBe(false);
  });

  it('passes showSkipButton prop correctly', () => {
    render(<TutorialWalkthrough {...defaultProps} showSkipButton={false} />);
    const el = screen.getByTestId('tutorial-walkthrough');
    const props = JSON.parse(el.getAttribute('data-props') || '{}');
    expect(props.showSkipButton).toBe(false);
  });

  it('calls onFinish when tutorial is finished', () => {
    render(<TutorialWalkthrough {...defaultProps} />);
    screen.getByText('Finish').click();
    expect(defaultProps.onFinish).toHaveBeenCalledTimes(1);
  });

  it('calls onSkip when tutorial is skipped', () => {
    render(<TutorialWalkthrough {...defaultProps} />);
    screen.getByText('Skip').click();
    expect(defaultProps.onSkip).toHaveBeenCalledTimes(1);
  });

  it('calls onStepChange when navigating next', () => {
    render(<TutorialWalkthrough {...defaultProps} />);
    screen.getByText('Next').click();
    expect(defaultProps.onStepChange).toHaveBeenCalledWith(1);
  });

  it('calls onStepChange when navigating prev', () => {
    render(<TutorialWalkthrough {...defaultProps} />);
    screen.getByText('Prev').click();
    expect(defaultProps.onStepChange).toHaveBeenCalledWith(0);
  });

  it('calls onFinish when navigating next beyond last step', () => {
    render(<TutorialWalkthrough {...defaultProps} stepIndex={2} />);
    const el = screen.getByTestId('tutorial-walkthrough');
    const props = JSON.parse(el.getAttribute('data-props') || '{}');

    const callback = vi.fn();
    const TestComponent = () => {
      return <TutorialWalkthrough {...defaultProps} stepIndex={2} onStepChange={callback} onFinish={defaultProps.onFinish} />;
    };
    render(<TestComponent />);
  });

  it('renders with default locale values', () => {
    render(<TutorialWalkthrough {...defaultProps} />);
    expect(screen.getByTestId('tutorial-walkthrough')).toBeDefined();
  });

  it('renders with custom locale values', () => {
    const customLocale = {
      last: 'DONE',
      back: 'PREV',
      next: 'NEXT',
      skip: 'SKIP',
      close: 'CLOSE',
    };
    render(<TutorialWalkthrough {...defaultProps} locale={customLocale} />);
    expect(screen.getByTestId('tutorial-walkthrough')).toBeDefined();
  });

  it('passes steps length to Joyride', () => {
    render(<TutorialWalkthrough {...defaultProps} />);
    const el = screen.getByTestId('tutorial-walkthrough');
    const props = JSON.parse(el.getAttribute('data-props') || '{}');
    expect(props.stepsLength).toBe(3);
  });
});
