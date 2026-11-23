import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TutorialProvider, useTutorial } from '../TutorialContext';

vi.mock('react-joyride', () => {
  const MockJoyride = vi.fn((props: any) => {
    if (!props.run) return null;
    return (
      <div data-testid="tutorial-walkthrough">
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

function TestConsumer() {
  const {
    activeTutorial,
    isRunning,
    startTutorial,
    stopTutorial,
    hasCompletedTutorial,
    markTutorialCompleted,
    resetTutorial,
  } = useTutorial();

  return (
    <div>
      <div data-testid="active-tutorial">{activeTutorial || 'none'}</div>
      <div data-testid="is-running">{String(isRunning)}</div>
      <button data-testid="start-simulator" onClick={() => startTutorial('simulator')}>
        Start Simulator
      </button>
      <button data-testid="start-playground" onClick={() => startTutorial('playground')}>
        Start Playground
      </button>
      <button data-testid="start-roadmap" onClick={() => startTutorial('roadmap')}>
        Start Roadmap
      </button>
      <button data-testid="stop" onClick={stopTutorial}>
        Stop
      </button>
      <button data-testid="check-completed" onClick={() => {
        const val = hasCompletedTutorial('simulator');
        document.body.setAttribute('data-completed', String(val));
      }}>
        Check Completed
      </button>
      <button data-testid="mark-completed" onClick={() => markTutorialCompleted('simulator')}>
        Mark Completed
      </button>
      <button data-testid="reset" onClick={() => resetTutorial('simulator')}>
        Reset
      </button>
    </div>
  );
}

describe('TutorialContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('provides default state', () => {
    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    expect(screen.getByTestId('active-tutorial').textContent).toBe('none');
    expect(screen.getByTestId('is-running').textContent).toBe('false');
  });

  it('starts a tutorial', () => {
    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    act(() => {
      screen.getByTestId('start-simulator').click();
    });

    expect(screen.getByTestId('active-tutorial').textContent).toBe('simulator');
    expect(screen.getByTestId('is-running').textContent).toBe('true');
  });

  it('stops a tutorial', () => {
    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    act(() => {
      screen.getByTestId('start-simulator').click();
    });
    act(() => {
      screen.getByTestId('stop').click();
    });

    expect(screen.getByTestId('active-tutorial').textContent).toBe('none');
    expect(screen.getByTestId('is-running').textContent).toBe('false');
  });

  it('can switch between different tutorials', () => {
    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    act(() => {
      screen.getByTestId('start-simulator').click();
    });
    expect(screen.getByTestId('active-tutorial').textContent).toBe('simulator');

    act(() => {
      screen.getByTestId('start-playground').click();
    });
    expect(screen.getByTestId('active-tutorial').textContent).toBe('playground');

    act(() => {
      screen.getByTestId('start-roadmap').click();
    });
    expect(screen.getByTestId('active-tutorial').textContent).toBe('roadmap');
  });

  it('marks tutorial as completed in localStorage', () => {
    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    act(() => {
      screen.getByTestId('mark-completed').click();
    });

    expect(localStorage.getItem('tutorial-completed-simulator')).toBe('true');
  });

  it('checks if tutorial is completed', () => {
    localStorage.setItem('tutorial-completed-simulator', 'true');

    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    act(() => {
      screen.getByTestId('check-completed').click();
    });

    expect(document.body.getAttribute('data-completed')).toBe('true');
  });

  it('resets tutorial completion', () => {
    localStorage.setItem('tutorial-completed-simulator', 'true');

    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    act(() => {
      screen.getByTestId('reset').click();
    });

    act(() => {
      screen.getByTestId('check-completed').click();
    });

    expect(document.body.getAttribute('data-completed')).toBe('false');
  });

  it('hasCompletedTutorial returns false for unknown tutorial', () => {
    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    act(() => {
      screen.getByTestId('check-completed').click();
    });

    expect(document.body.getAttribute('data-completed')).toBe('false');
  });

  it('renders Joyride when tutorial is active', () => {
    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    expect(screen.queryByTestId('tutorial-walkthrough')).toBeNull();

    act(() => {
      screen.getByTestId('start-simulator').click();
    });

    expect(screen.getByTestId('tutorial-walkthrough')).toBeDefined();
  });

  it('finishing a tutorial marks it completed and stops', () => {
    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    act(() => {
      screen.getByTestId('start-simulator').click();
    });

    act(() => {
      screen.getByText('Finish').click();
    });

    expect(screen.getByTestId('active-tutorial').textContent).toBe('none');
    expect(localStorage.getItem('tutorial-completed-simulator')).toBe('true');
  });

  it('skipping a tutorial stops without marking complete', () => {
    render(
      <TutorialProvider>
        <TestConsumer />
      </TutorialProvider>
    );

    act(() => {
      screen.getByTestId('start-simulator').click();
    });

    act(() => {
      screen.getByText('Skip').click();
    });

    expect(screen.getByTestId('active-tutorial').textContent).toBe('none');
    expect(localStorage.getItem('tutorial-completed-simulator')).toBeNull();
  });
});

describe('useTutorial - without provider', () => {
  it('throws when used outside provider', () => {
    const TestBad = () => {
      useTutorial();
      return null;
    };

    expect(() => render(<TestBad />)).toThrow('useTutorial must be used within a TutorialProvider');
  });
});
