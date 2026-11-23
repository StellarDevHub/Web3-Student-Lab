import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useFocusTrap, useRestoreFocus } from '../useFocusTrap';

describe('useFocusTrap', () => {
  function setup() {
    const container = document.createElement('div');
    const outerBtn = document.createElement('button');
    outerBtn.textContent = 'Outer';
    outerBtn.tabIndex = 0;
    const innerBtn1 = document.createElement('button');
    innerBtn1.textContent = 'Inner 1';
    innerBtn1.tabIndex = 0;
    const innerBtn2 = document.createElement('button');
    innerBtn2.textContent = 'Inner 2';
    innerBtn2.tabIndex = 0;
    container.append(innerBtn1, innerBtn2);
    document.body.append(outerBtn, container);
    return { container, outerBtn, innerBtn1, innerBtn2 };
  }

  it('focuses first focusable element on mount when enabled', () => {
    const { container, innerBtn1 } = setup();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, { enabled: true, initialFocus: true }));

    expect(document.activeElement === innerBtn1).toBe(true);
    container.remove();
  });

  it('does not focus when initialFocus is false', () => {
    const { container, innerBtn1, outerBtn } = setup();
    outerBtn.focus();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, { enabled: true, initialFocus: false }));

    expect(document.activeElement === outerBtn).toBe(true);
    container.remove();
  });

  it('does not trap focus when disabled', () => {
    const { container, innerBtn1 } = setup();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, { enabled: false }));

    expect(document.activeElement === innerBtn1).toBe(false);
    container.remove();
  });

  it('traps Tab focus within container cycling forward', () => {
    const { container, innerBtn1, innerBtn2 } = setup();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, { enabled: true, initialFocus: true }));

    innerBtn2.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    innerBtn2.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(document.activeElement === innerBtn1).toBe(true);
    container.remove();
  });

  it('traps Shift+Tab focus within container cycling backward', () => {
    const { container, innerBtn1, innerBtn2 } = setup();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, { enabled: true, initialFocus: true }));

    innerBtn1.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    innerBtn1.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(document.activeElement === innerBtn2).toBe(true);
    container.remove();
  });

  it('prevents default Tab when no focusable elements', () => {
    const emptyContainer = document.createElement('div');
    document.body.append(emptyContainer);

    const ref = { current: emptyContainer };
    renderHook(() => useFocusTrap(ref, { enabled: true, initialFocus: false }));

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    emptyContainer.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    emptyContainer.remove();
  });

  it('calls onEscape when Escape is pressed', () => {
    const { container } = setup();
    const ref = { current: container };
    const onEscape = vi.fn();
    renderHook(() => useFocusTrap(ref, { enabled: true, initialFocus: false, onEscape }));

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onEscape).toHaveBeenCalled();
    container.remove();
  });

  it('does nothing for non-Tab keys', () => {
    const { container, innerBtn2 } = setup();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, { enabled: true, initialFocus: false }));

    innerBtn2.focus();
    innerBtn2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(document.activeElement === innerBtn2).toBe(true);
    container.remove();
  });

  it('sets tabindex=-1 on container when no focusable children', () => {
    const emptyContainer = document.createElement('div');
    document.body.append(emptyContainer);

    const ref = { current: emptyContainer };
    renderHook(() => useFocusTrap(ref, { enabled: true, initialFocus: true }));

    expect(document.activeElement === emptyContainer).toBe(true);
    expect(emptyContainer.getAttribute('tabindex')).toBe('-1');
    emptyContainer.remove();
  });

  it('traps Tab when activeElement is outside container', () => {
    const { container, innerBtn1, outerBtn } = setup();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, { enabled: true, initialFocus: false }));

    outerBtn.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(event);

    expect(document.activeElement === innerBtn1).toBe(true);
    container.remove();
  });

  it('traps Shift+Tab when activeElement is outside container', () => {
    const { container, innerBtn2, outerBtn } = setup();
    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, { enabled: true, initialFocus: false }));

    outerBtn.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(event);

    expect(document.activeElement === innerBtn2).toBe(true);
    container.remove();
  });

  it('does not try to restore focus when returnFocusOnDeactivate is false', () => {
    const { container, innerBtn1 } = setup();
    const ref = { current: container };
    const { unmount } = renderHook(() =>
      useFocusTrap(ref, {
        enabled: true,
        initialFocus: true,
        returnFocusOnDeactivate: false,
      })
    );

    const otherBtn = document.createElement('button');
    otherBtn.tabIndex = 0;
    document.body.append(otherBtn);
    otherBtn.focus();

    unmount();
    expect(document.activeElement === otherBtn).toBe(true);
    otherBtn.remove();
    container.remove();
  });

  it('does not restore focus when previous element is removed from DOM', () => {
    const { container, innerBtn1, outerBtn } = setup();
    outerBtn.remove();

    const ref = { current: container };
    const { unmount } = renderHook(() =>
      useFocusTrap(ref, { enabled: true, initialFocus: true })
    );

    unmount();
    container.remove();
  });
});

describe('useRestoreFocus', () => {
  it('saves and restores focus', () => {
    const btn = document.createElement('button');
    btn.tabIndex = 0;
    document.body.append(btn);
    btn.focus();

    const { result } = renderHook(() => useRestoreFocus());

    result.current.saveFocus();

    const otherBtn = document.createElement('button');
    otherBtn.tabIndex = 0;
    document.body.append(otherBtn);
    otherBtn.focus();

    result.current.restoreFocus();
    expect(document.activeElement === btn).toBe(true);

    btn.remove();
    otherBtn.remove();
  });

  it('restores focus to returnFocusRef if provided', () => {
    const btn = document.createElement('button');
    btn.tabIndex = 0;
    document.body.append(btn);

    const returnFocusRef = { current: btn };
    const { result } = renderHook(() => useRestoreFocus(returnFocusRef));

    const otherBtn = document.createElement('button');
    document.body.append(otherBtn);
    otherBtn.focus();

    result.current.restoreFocus();
    expect(document.activeElement === btn).toBe(true);

    btn.remove();
    otherBtn.remove();
  });
});
