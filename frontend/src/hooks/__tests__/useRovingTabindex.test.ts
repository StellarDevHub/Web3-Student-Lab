import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useRovingTabindex } from '../useRovingTabindex';

describe('useRovingTabindex', () => {
  function setup(count: number) {
    const container = document.createElement('div');
    const buttons: HTMLButtonElement[] = [];
    for (let i = 0; i < count; i++) {
      const btn = document.createElement('button');
      btn.textContent = `btn${i}`;
      buttons.push(btn);
      container.append(btn);
    }
    document.body.append(container);
    return { container, buttons };
  }

  it('sets initial tabindex to 0 on first item and -1 on others', () => {
    const { container, buttons } = setup(3);

    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref }));

    expect(buttons[0].tabIndex).toBe(0);
    expect(buttons[1].tabIndex).toBe(-1);
    expect(buttons[2].tabIndex).toBe(-1);

    container.remove();
  });

  it('navigates with ArrowRight', () => {
    const { container, buttons } = setup(2);
    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref, direction: 'horizontal' }));

    buttons[0].focus();
    buttons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );

    expect(document.activeElement === buttons[1]).toBe(true);
    expect(buttons[0].tabIndex).toBe(-1);
    expect(buttons[1].tabIndex).toBe(0);

    container.remove();
  });

  it('navigates with ArrowLeft', () => {
    const { container, buttons } = setup(2);
    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref, direction: 'horizontal' }));

    buttons[1].focus();
    buttons[1].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    buttons[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    );

    expect(document.activeElement === buttons[0]).toBe(true);

    container.remove();
  });

  it('wraps around on ArrowRight at end', () => {
    const { container, buttons } = setup(2);
    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref, direction: 'horizontal' }));

    buttons[1].focus();
    buttons[1].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    buttons[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );

    expect(document.activeElement === buttons[0]).toBe(true);

    container.remove();
  });

  it('wraps around on ArrowLeft at start', () => {
    const { container, buttons } = setup(2);
    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref, direction: 'horizontal' }));

    buttons[0].focus();
    buttons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    );

    expect(document.activeElement === buttons[1]).toBe(true);

    container.remove();
  });

  it('navigates with ArrowDown for vertical direction', () => {
    const { container, buttons } = setup(2);
    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref, direction: 'vertical' }));

    buttons[0].focus();
    buttons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );

    expect(document.activeElement === buttons[1]).toBe(true);

    container.remove();
  });

  it('navigates with ArrowUp for vertical direction', () => {
    const { container, buttons } = setup(2);
    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref, direction: 'vertical' }));

    buttons[1].focus();
    buttons[1].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    buttons[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    );

    expect(document.activeElement === buttons[0]).toBe(true);

    container.remove();
  });

  it('navigates with Home key', () => {
    const { container, buttons } = setup(3);
    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref }));

    buttons[2].focus();
    buttons[2].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    buttons[2].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
    );

    expect(document.activeElement === buttons[0]).toBe(true);

    container.remove();
  });

  it('navigates with End key', () => {
    const { container, buttons } = setup(3);
    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref }));

    buttons[0].focus();
    buttons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true })
    );

    expect(document.activeElement === buttons[2]).toBe(true);

    container.remove();
  });

  it('supports both horizontal and vertical navigation', () => {
    const { container, buttons } = setup(2);
    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref, direction: 'both' }));

    buttons[0].focus();
    buttons[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );
    expect(document.activeElement === buttons[1]).toBe(true);

    buttons[1].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    buttons[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    );
    expect(document.activeElement === buttons[0]).toBe(true);

    container.remove();
  });

  it('calls onItemFocus when item is focused', () => {
    const { container, buttons } = setup(2);
    const onItemFocus = vi.fn();
    const ref = { current: container };
    renderHook(() => useRovingTabindex({ containerRef: ref, onItemFocus }));

    buttons[1].focus();
    buttons[1].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(onItemFocus).toHaveBeenCalledWith(buttons[1]);

    container.remove();
  });
});
