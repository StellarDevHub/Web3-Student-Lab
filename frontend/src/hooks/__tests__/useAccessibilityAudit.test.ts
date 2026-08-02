import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccessibilityAudit } from '../useAccessibilityAudit';

// We test the hook in isolation by using fake timers to control the debounce.

const CLEAN_SOURCE = `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol};
/// A simple contract.
#[contract]
pub struct HelloContract;
#[contractimpl]
impl HelloContract {
    /// Returns a greeting.
    pub fn hello(env: Env) -> Symbol {
        Symbol::new(&env, "hello")
    }
}
`;

const DIRTY_SOURCE = `use soroban_sdk::{};\npub struct Missing;\nfn f() { panic!("bad"); }`;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAccessibilityAudit', () => {
  it('starts with result=null before the debounce fires', () => {
    const { result } = renderHook(() =>
      useAccessibilityAudit(DIRTY_SOURCE, { debounceMs: 400 })
    );
    expect(result.current.result).toBeNull();
  });

  it('isPending is true while debounce is in-flight', () => {
    const { result } = renderHook(() =>
      useAccessibilityAudit(DIRTY_SOURCE, { debounceMs: 400 })
    );
    expect(result.current.isPending).toBe(true);
  });

  it('result is populated after debounce fires', () => {
    const { result } = renderHook(() =>
      useAccessibilityAudit(DIRTY_SOURCE, { debounceMs: 400 })
    );
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.result).not.toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it('result.passed is true for a clean source', () => {
    const { result } = renderHook(() =>
      useAccessibilityAudit(CLEAN_SOURCE, { debounceMs: 400 })
    );
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.result?.passed).toBe(true);
  });

  it('result.hasIssues is true for a dirty source', () => {
    const { result } = renderHook(() =>
      useAccessibilityAudit(DIRTY_SOURCE, { debounceMs: 400 })
    );
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.result?.hasIssues).toBe(true);
  });

  it('debounces rapid source changes — only runs audit once', () => {
    let source = DIRTY_SOURCE;
    const { result, rerender } = renderHook(() =>
      useAccessibilityAudit(source, { debounceMs: 400 })
    );

    // Simulate rapid typing
    source = DIRTY_SOURCE + '\n// change 1';
    rerender();
    source = DIRTY_SOURCE + '\n// change 2';
    rerender();
    source = DIRTY_SOURCE + '\n// change 3';
    rerender();

    // Should still be pending — timer not fired yet
    expect(result.current.isPending).toBe(true);

    // Fire the single debounced timer
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Should have run exactly once after the last change
    expect(result.current.result).not.toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it('re-runs audit when source changes after initial run', () => {
    let source = DIRTY_SOURCE;
    const { result, rerender } = renderHook(() =>
      useAccessibilityAudit(source, { debounceMs: 400 })
    );

    act(() => { vi.advanceTimersByTime(400); });
    const firstResult = result.current.result;

    // Change to a clean source
    source = CLEAN_SOURCE;
    rerender();

    act(() => { vi.advanceTimersByTime(400); });
    const secondResult = result.current.result;

    expect(firstResult?.passed).toBe(false);
    expect(secondResult?.passed).toBe(true);
  });

  it('runAudit triggers an immediate (non-debounced) audit', () => {
    const { result } = renderHook(() =>
      useAccessibilityAudit(DIRTY_SOURCE, { debounceMs: 400 })
    );

    // Don't advance timers; call runAudit directly
    act(() => {
      result.current.runAudit();
    });

    expect(result.current.result).not.toBeNull();
  });

  it('does not run audit when enabled is false', () => {
    const { result } = renderHook(() =>
      useAccessibilityAudit(DIRTY_SOURCE, { debounceMs: 400, enabled: false })
    );
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current.result).toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it('clears result when enabled changes to false', () => {
    let enabled = true;
    const { result, rerender } = renderHook(() =>
      useAccessibilityAudit(DIRTY_SOURCE, { debounceMs: 400, enabled })
    );
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current.result).not.toBeNull();

    enabled = false;
    rerender();
    expect(result.current.result).toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it('getIssuesBySeverity returns only error issues', () => {
    const { result } = renderHook(() =>
      useAccessibilityAudit(DIRTY_SOURCE, { debounceMs: 400 })
    );
    act(() => { vi.advanceTimersByTime(400); });
    const errors = result.current.getIssuesBySeverity('error');
    expect(errors.every((i) => i.severity === 'error')).toBe(true);
  });

  it('getIssuesBySeverity returns empty array when result is null', () => {
    const { result } = renderHook(() =>
      useAccessibilityAudit(DIRTY_SOURCE, { debounceMs: 400 })
    );
    // Don't advance timers — result is still null
    const errors = result.current.getIssuesBySeverity('error');
    expect(errors).toEqual([]);
  });

  it('uses 400ms debounce by default', () => {
    const { result } = renderHook(() =>
      useAccessibilityAudit(DIRTY_SOURCE)
    );

    // At 399ms — still pending
    act(() => { vi.advanceTimersByTime(399); });
    expect(result.current.isPending).toBe(true);

    // At 400ms — should have resolved
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.result).not.toBeNull();
  });
});
