import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  useGlobalShortcuts,
  useArrowNavigation,
  useTypeAhead,
  useKeyboardNavigation,
  useFocusVisible,
} from '../useKeyboardNavigation';

function isActiveElement(el: HTMLElement | null): boolean {
  return document.activeElement === el;
}

describe('useGlobalShortcuts', () => {
  it('calls shortcut handler on matching keydown', () => {
    const handler = vi.fn();
    renderHook(() => useGlobalShortcuts({ Escape: handler }));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler when disabled', () => {
    const handler = vi.fn();
    renderHook(() => useGlobalShortcuts({ Escape: handler }, false));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('recognizes Ctrl+ shortcuts', () => {
    const handler = vi.fn();
    renderHook(() => useGlobalShortcuts({ 'Ctrl+s': handler }));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', ctrlKey: true })
      );
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('recognizes Alt+ shortcuts', () => {
    const handler = vi.fn();
    renderHook(() => useGlobalShortcuts({ 'Alt+n': handler }));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'n', altKey: true })
      );
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('recognizes Shift+ shortcuts', () => {
    const handler = vi.fn();
    renderHook(() => useGlobalShortcuts({ 'Shift+Tab': handler }));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })
      );
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler for non-matching keys', () => {
    const handler = vi.fn();
    renderHook(() => useGlobalShortcuts({ Escape: handler }));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('cleans up event listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useGlobalShortcuts({ Escape: handler }));

    unmount();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useArrowNavigation', () => {
  function setup() {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    btn1.textContent = 'btn1';
    btn2.textContent = 'btn2';
    btn1.tabIndex = 0;
    btn2.tabIndex = 0;
    container.append(btn1, btn2);
    document.body.append(container);
    return { container, btn1, btn2 };
  }

  it('navigates to next element on ArrowRight', () => {
    const { container, btn1, btn2 } = setup();
    const ref = { current: container };
    const onActivate = vi.fn();
    renderHook(() => useArrowNavigation(ref, { direction: 'horizontal', onActivate }));

    btn1.focus();
    act(() => {
      btn1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(isActiveElement(btn2)).toBe(true);
    expect(onActivate).toHaveBeenCalledWith(btn2);
    container.remove();
  });

  it('navigates to previous element on ArrowLeft', () => {
    const { container, btn1, btn2 } = setup();
    const ref = { current: container };
    renderHook(() => useArrowNavigation(ref, { direction: 'horizontal' }));

    btn2.focus();
    act(() => {
      btn2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });

    expect(isActiveElement(btn1)).toBe(true);
    container.remove();
  });

  it('wraps around with circular navigation', () => {
    const { container, btn1, btn2 } = setup();
    const ref = { current: container };
    renderHook(() => useArrowNavigation(ref, { direction: 'horizontal', circular: true }));

    btn2.focus();
    act(() => {
      btn2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(isActiveElement(btn1)).toBe(true);
    container.remove();
  });

  it('stops at boundary without circular navigation', () => {
    const { container, btn1, btn2 } = setup();
    const ref = { current: container };
    renderHook(() => useArrowNavigation(ref, { direction: 'horizontal', circular: false }));

    btn2.focus();
    act(() => {
      btn2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(isActiveElement(btn2)).toBe(true);
    container.remove();
  });

  it('ignores non-arrow keys', () => {
    const { container, btn1 } = setup();
    const ref = { current: container };
    renderHook(() => useArrowNavigation(ref, { direction: 'horizontal' }));

    btn1.focus();
    act(() => {
      btn1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(isActiveElement(btn1)).toBe(true);
    container.remove();
  });

  it('navigates vertically with ArrowDown/ArrowUp', () => {
    const { container, btn1, btn2 } = setup();
    const ref = { current: container };
    renderHook(() => useArrowNavigation(ref, { direction: 'vertical' }));

    btn1.focus();
    act(() => {
      btn1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    expect(isActiveElement(btn2)).toBe(true);

    act(() => {
      btn2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });

    expect(isActiveElement(btn1)).toBe(true);
    container.remove();
  });

  it('does nothing for element outside container', () => {
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    outside.tabIndex = 0;
    document.body.append(outside);

    const ref = { current: document.createElement('div') };
    renderHook(() => useArrowNavigation(ref, { direction: 'horizontal' }));

    outside.focus();
    act(() => {
      outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(isActiveElement(outside)).toBe(true);
    outside.remove();
  });
});

describe('useTypeAhead', () => {
  it('focuses item matching typed characters', () => {
    const container = document.createElement('div');
    const item1 = document.createElement('button');
    const item2 = document.createElement('button');
    item1.setAttribute('role', 'option');
    item1.textContent = 'Apple';
    item2.setAttribute('role', 'option');
    item2.textContent = 'Banana';
    container.append(item1, item2);
    document.body.append(container);

    const ref = { current: container };
    const onItemFound = vi.fn();
    renderHook(() => useTypeAhead({ containerRef: ref, onItemFound }));

    act(() => {
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    });

    expect(isActiveElement(item2)).toBe(true);
    expect(onItemFound).toHaveBeenCalledWith(item2, 'b');
    container.remove();
  });

  it('ignores keydown in input elements', () => {
    const container = document.createElement('div');
    const input = document.createElement('input');
    container.append(input);
    document.body.append(container);

    const ref = { current: container };
    const onItemFound = vi.fn();
    renderHook(() => useTypeAhead({ containerRef: ref, onItemFound }));

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });

    expect(onItemFound).not.toHaveBeenCalled();
    container.remove();
  });

  it('ignores control keys', () => {
    const container = document.createElement('div');
    const item = document.createElement('button');
    item.setAttribute('role', 'option');
    item.textContent = 'Test';
    container.append(item);
    document.body.append(container);

    const ref = { current: container };
    const onItemFound = vi.fn();
    renderHook(() => useTypeAhead({ containerRef: ref, onItemFound }));

    act(() => {
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true }));
    });

    expect(onItemFound).not.toHaveBeenCalled();
    container.remove();
  });

  it('uses custom selector for items', () => {
    const container = document.createElement('div');
    const item = document.createElement('button');
    item.setAttribute('role', 'treeitem');
    item.textContent = 'Projects';
    container.append(item);
    document.body.append(container);

    const ref = { current: container };
    const onItemFound = vi.fn();
    renderHook(() =>
      useTypeAhead({
        containerRef: ref,
        selector: '[role="treeitem"]',
        onItemFound,
      })
    );

    act(() => {
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    });

    expect(isActiveElement(item)).toBe(true);
    expect(onItemFound).toHaveBeenCalledWith(item, 'p');
    container.remove();
  });

  it('cleans up timer on unmount', () => {
    const container = document.createElement('div');
    const ref = { current: container };
    const { unmount } = renderHook(() => useTypeAhead({ containerRef: ref }));

    unmount();
  });
});

describe('useKeyboardNavigation', () => {
  function setup() {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    const btn3 = document.createElement('button');
    btn1.textContent = 'First';
    btn2.textContent = 'Middle';
    btn3.textContent = 'Last';
    btn1.tabIndex = 0;
    btn2.tabIndex = 0;
    btn3.tabIndex = 0;
    container.append(btn1, btn2, btn3);
    document.body.append(container);
    return { container, btn1, btn2, btn3 };
  }

  it('handles Enter key activation', () => {
    const { container, btn1 } = setup();
    const ref = { current: container };
    const onActivate = vi.fn();
    renderHook(() => useKeyboardNavigation(ref, { direction: 'horizontal', onActivate }));

    btn1.focus();
    act(() => {
      btn1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onActivate).toHaveBeenCalledWith(btn1);
    container.remove();
  });

  it('handles Space key activation', () => {
    const { container, btn1 } = setup();
    const ref = { current: container };
    const onActivate = vi.fn();
    renderHook(() => useKeyboardNavigation(ref, { direction: 'horizontal', onActivate }));

    btn1.focus();
    act(() => {
      btn1.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    expect(onActivate).toHaveBeenCalledWith(btn1);
    container.remove();
  });

  it('handles Escape key', () => {
    const { container, btn1 } = setup();
    const ref = { current: container };
    const onEscape = vi.fn();
    renderHook(() => useKeyboardNavigation(ref, { direction: 'horizontal', onEscape }));

    btn1.focus();
    act(() => {
      btn1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onEscape).toHaveBeenCalled();
    container.remove();
  });

  it('handles Home/End keys', () => {
    const { container, btn1, btn2, btn3 } = setup();
    const ref = { current: container };
    renderHook(() => useKeyboardNavigation(ref, { direction: 'horizontal' }));

    btn2.focus();

    act(() => {
      btn2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    expect(isActiveElement(btn1)).toBe(true);

    act(() => {
      btn1.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(isActiveElement(btn3)).toBe(true);

    container.remove();
  });

  it('ignores events from outside container', () => {
    const container = document.createElement('div');
    const outsideBtn = document.createElement('button');
    outsideBtn.tabIndex = 0;
    document.body.append(container, outsideBtn);

    const ref = { current: container };
    const onEscape = vi.fn();
    renderHook(() => useKeyboardNavigation(ref, { direction: 'horizontal', onEscape }));

    outsideBtn.focus();
    act(() => {
      outsideBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onEscape).not.toHaveBeenCalled();
    container.remove();
    outsideBtn.remove();
  });
});

describe('useFocusVisible', () => {
  it('returns true after Tab key press', () => {
    const { result } = renderHook(() => useFocusVisible());

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    });

    expect(result.current).toBe(true);
  });

  it('returns false after mouse down', () => {
    const { result } = renderHook(() => useFocusVisible());

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    });

    expect(result.current).toBe(true);

    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown'));
    });

    expect(result.current).toBe(false);
  });

  it('initializes as false', () => {
    const { result } = renderHook(() => useFocusVisible());
    expect(result.current).toBe(false);
  });

  it('cleans up event listeners', () => {
    const { unmount } = renderHook(() => useFocusVisible());
    unmount();
  });
});
