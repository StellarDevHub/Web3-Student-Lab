import { renderHook, act } from '@testing-library/react';
import { useTourProgress } from '@/hooks/useTourProgress';

describe('useTourProgress Hook', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('should auto-trigger for first-time visitors', () => {
    const { result } = renderHook(() => useTourProgress());

    expect(result.current.isInitialized).toBe(true);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.isActive).toBe(true);
    expect(result.current.stepIndex).toBe(0);
  });

  it('should remember completion status and avoid re-prompting', () => {
    localStorage.setItem('web3_lab_code_tour_completed', 'true');

    const { result } = renderHook(() => useTourProgress());

    expect(result.current.isCompleted).toBe(true);
    expect(result.current.isActive).toBe(false);
  });

  it('should allow skipping tour and save completion in localStorage', () => {
    const { result } = renderHook(() => useTourProgress());

    act(() => {
      result.current.skipTour();
    });

    expect(result.current.isCompleted).toBe(true);
    expect(result.current.isActive).toBe(false);
    expect(localStorage.getItem('web3_lab_code_tour_completed')).toBe('true');
  });

  it('should allow advancing steps and completing the tour', () => {
    const { result } = renderHook(() => useTourProgress());

    act(() => {
      result.current.setStepIndex(2);
    });
    expect(result.current.stepIndex).toBe(2);

    act(() => {
      result.current.completeTour();
    });
    expect(result.current.isCompleted).toBe(true);
    expect(result.current.isActive).toBe(false);
  });
});
