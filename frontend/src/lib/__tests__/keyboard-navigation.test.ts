import { describe, it, expect } from 'vitest';
import {
  KEYS,
  FOCUSABLE_SELECTOR,
  getFocusableElements,
  getFirstFocusable,
  getLastFocusable,
  getNextFocusable,
  getPreviousFocusable,
  focusFirstFocusable,
  focusLastFocusable,
  isVisible,
  getTabbableElements,
  getArrowNavigationTarget,
} from '../keyboard-navigation';

describe('KEYS', () => {
  it('defines all expected key constants', () => {
    expect(KEYS.TAB).toBe('Tab');
    expect(KEYS.ENTER).toBe('Enter');
    expect(KEYS.SPACE).toBe(' ');
    expect(KEYS.ESCAPE).toBe('Escape');
    expect(KEYS.HOME).toBe('Home');
    expect(KEYS.END).toBe('End');
    expect(KEYS.ARROW_UP).toBe('ArrowUp');
    expect(KEYS.ARROW_DOWN).toBe('ArrowDown');
    expect(KEYS.ARROW_LEFT).toBe('ArrowLeft');
    expect(KEYS.ARROW_RIGHT).toBe('ArrowRight');
    expect(KEYS.BACKSPACE).toBe('Backspace');
    expect(KEYS.DELETE).toBe('Delete');
  });
});

describe('FOCUSABLE_SELECTOR', () => {
  it('includes anchor, button, input, select, textarea, and tabindex elements', () => {
    expect(FOCUSABLE_SELECTOR).toContain('a[href]');
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('input:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('select:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('textarea:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]');
    expect(FOCUSABLE_SELECTOR).toContain('[contenteditable="true"]');
    expect(FOCUSABLE_SELECTOR).toContain('iframe');
  });
});

describe('getFocusableElements', () => {
  it('returns all focusable elements in a container', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <a href="#">Link</a>
      <button>Button</button>
      <input />
      <select><option>1</option></select>
      <textarea></textarea>
      <div tabindex="0">Tabindex div</div>
    `;
    document.body.append(container);

    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(6);

    container.remove();
  });

  it('includes hidden elements (visibility filtered by display/offset in production)', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button style="display:none">Hidden</button>
      <button>Visible</button>
    `;
    document.body.append(container);

    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(2);

    container.remove();
  });

  it('excludes elements with aria-hidden="true"', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button aria-hidden="true">Aria hidden</button>
      <button>Visible</button>
    `;
    document.body.append(container);

    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(1);
    expect(elements[0].textContent).toBe('Visible');

    container.remove();
  });

  it('returns empty array when no focusable elements', () => {
    const container = document.createElement('div');
    container.textContent = 'No focusable elements here';

    const elements = getFocusableElements(container);
    expect(elements).toEqual([]);
  });

  it('excludes disabled buttons', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button disabled>Disabled</button>
      <button>Enabled</button>
    `;

    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(1);
    expect(elements[0].textContent).toBe('Enabled');
  });
});

describe('getFirstFocusable', () => {
  it('returns the first focusable element', () => {
    const container = document.createElement('div');
    container.innerHTML = `<button>First</button><button>Second</button>`;

    const first = getFirstFocusable(container);
    expect(first?.textContent).toBe('First');
  });

  it('returns null when no focusable elements', () => {
    const container = document.createElement('div');
    expect(getFirstFocusable(container)).toBeNull();
  });
});

describe('getLastFocusable', () => {
  it('returns the last focusable element', () => {
    const container = document.createElement('div');
    container.innerHTML = `<button>First</button><button>Last</button>`;

    const last = getLastFocusable(container);
    expect(last?.textContent).toBe('Last');
  });

  it('returns null when no focusable elements', () => {
    const container = document.createElement('div');
    expect(getLastFocusable(container)).toBeNull();
  });
});

describe('getNextFocusable', () => {
  it('returns the next focusable element', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.append(btn1, btn2);

    const next = getNextFocusable(container, btn1);
    expect(next).toBe(btn2);
  });

  it('wraps to first when current is last', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.append(btn1, btn2);

    const next = getNextFocusable(container, btn2);
    expect(next).toBe(btn1);
  });

  it('returns null when element not in container', () => {
    const container = document.createElement('div');
    const outside = document.createElement('button');

    const next = getNextFocusable(container, outside);
    expect(next).toBeNull();
  });
});

describe('getPreviousFocusable', () => {
  it('returns the previous focusable element', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.append(btn1, btn2);

    const prev = getPreviousFocusable(container, btn2);
    expect(prev).toBe(btn1);
  });

  it('wraps to last when current is first', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.append(btn1, btn2);

    const prev = getPreviousFocusable(container, btn1);
    expect(prev).toBe(btn2);
  });

  it('returns null when element not in container', () => {
    const container = document.createElement('div');
    const outside = document.createElement('button');

    const prev = getPreviousFocusable(container, outside);
    expect(prev).toBeNull();
  });
});

describe('focusFirstFocusable / focusLastFocusable', () => {
  it('focuses the first focusable element', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.append(btn1, btn2);
    document.body.append(container);

    focusFirstFocusable(container);
    expect(document.activeElement).toBe(btn1);

    container.remove();
  });

  it('focuses the last focusable element', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.append(btn1, btn2);
    document.body.append(container);

    focusLastFocusable(container);
    expect(document.activeElement).toBe(btn2);

    container.remove();
  });
});

describe('isVisible', () => {
  it('returns true for visible elements', () => {
    const el = document.createElement('button');
    document.body.append(el);
    expect(isVisible(el));
    el.remove();
  });

  it('returns false for display:none elements', () => {
    const el = document.createElement('button');
    el.style.display = 'none';
    document.body.append(el);
    expect(isVisible(el)).toBe(false);
    el.remove();
  });

  it('returns true for elements with offset', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: 100 });
    expect(isVisible(el)).toBe(true);
  });
});

describe('getTabbableElements', () => {
  it('excludes elements with negative tabindex', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    btn1.tabIndex = -1;
    const btn2 = document.createElement('button');
    container.append(btn1, btn2);

    const tabbable = getTabbableElements(container);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(btn2);
  });
});

describe('getArrowNavigationTarget', () => {
  it('navigates right in horizontal direction', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    btn1.tabIndex = 0;
    btn2.tabIndex = 0;
    container.append(btn1, btn2);

    const target = getArrowNavigationTarget(btn1, 'ArrowRight', {
      direction: 'horizontal',
    });
    expect(target).toBe(btn2);
  });

  it('navigates left in horizontal direction', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    btn1.tabIndex = 0;
    btn2.tabIndex = 0;
    container.append(btn1, btn2);

    const target = getArrowNavigationTarget(btn2, 'ArrowLeft', {
      direction: 'horizontal',
    });
    expect(target).toBe(btn1);
  });

  it('navigates down in vertical direction', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    btn1.tabIndex = 0;
    btn2.tabIndex = 0;
    container.append(btn1, btn2);

    const target = getArrowNavigationTarget(btn1, 'ArrowDown', {
      direction: 'vertical',
    });
    expect(target).toBe(btn2);
  });

  it('navigates up in vertical direction', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    btn1.tabIndex = 0;
    btn2.tabIndex = 0;
    container.append(btn1, btn2);

    const target = getArrowNavigationTarget(btn2, 'ArrowUp', {
      direction: 'vertical',
    });
    expect(target).toBe(btn1);
  });

  it('returns null for non-arrow keys', () => {
    const container = document.createElement('div');
    const btn = document.createElement('button');
    btn.tabIndex = 0;
    container.append(btn);

    const target = getArrowNavigationTarget(btn, 'Enter', {
      direction: 'horizontal',
    });
    expect(target).toBeNull();
  });

  it('returns null when element has no parent', () => {
    const orphan = document.createElement('button');
    const target = getArrowNavigationTarget(orphan, 'ArrowRight', {
      direction: 'horizontal',
    });
    expect(target).toBeNull();
  });

  it('circular navigation wraps around', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    btn1.tabIndex = 0;
    btn2.tabIndex = 0;
    container.append(btn1, btn2);

    const target = getArrowNavigationTarget(btn2, 'ArrowRight', {
      direction: 'horizontal',
      circular: true,
    });
    expect(target).toBe(btn1);
  });

  it('returns null at boundary without circular', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    btn1.tabIndex = 0;
    btn2.tabIndex = 0;
    container.append(btn1, btn2);

    const target = getArrowNavigationTarget(btn2, 'ArrowRight', {
      direction: 'horizontal',
      circular: false,
    });
    expect(target).toBeNull();
  });

  it('navigates in both direction', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    btn1.tabIndex = 0;
    btn2.tabIndex = 0;
    container.append(btn1, btn2);

    const targetRight = getArrowNavigationTarget(btn1, 'ArrowRight', {
      direction: 'both',
    });
    expect(targetRight).toBe(btn2);

    const targetLeft = getArrowNavigationTarget(btn2, 'ArrowLeft', {
      direction: 'both',
    });
    expect(targetLeft).toBe(btn1);

    const targetDown = getArrowNavigationTarget(btn1, 'ArrowDown', {
      direction: 'both',
    });
    expect(targetDown).toBe(btn2);

    const targetUp = getArrowNavigationTarget(btn2, 'ArrowUp', {
      direction: 'both',
    });
    expect(targetUp).toBe(btn1);
  });

  it('returns null at vertical boundary without circular for ArrowDown', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    btn1.tabIndex = 0;
    container.append(btn1);

    const target = getArrowNavigationTarget(btn1, 'ArrowDown', {
      direction: 'vertical',
      circular: false,
    });
    expect(target).toBeNull();
  });

  it('returns null at vertical boundary without circular for ArrowUp', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    btn1.tabIndex = 0;
    container.append(btn1);

    const target = getArrowNavigationTarget(btn1, 'ArrowUp', {
      direction: 'vertical',
      circular: false,
    });
    expect(target).toBeNull();
  });

  it('wraps around for vertical direction with circular', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    btn1.tabIndex = 0;
    btn2.tabIndex = 0;
    container.append(btn1, btn2);

    const targetDown = getArrowNavigationTarget(btn2, 'ArrowDown', {
      direction: 'vertical',
      circular: true,
    });
    expect(targetDown).toBe(btn1);

    const targetUp = getArrowNavigationTarget(btn1, 'ArrowUp', {
      direction: 'vertical',
      circular: true,
    });
    expect(targetUp).toBe(btn2);
  });
});

describe('getGridNavigationTarget', () => {
  function createGridCell(
    top: number,
    left: number,
    width = 50,
    height = 30
  ): HTMLButtonElement {
    const el = document.createElement('button');
    el.tabIndex = 0;
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ top, left, width, height, right: left + width, bottom: top + height }),
      configurable: true,
    });
    return el;
  }

  function createGridContainer(
    cells: { row: number; col: number }[]
  ): { container: HTMLDivElement; items: HTMLButtonElement[] } {
    const container = document.createElement('div');
    const cellHeight = 30;
    const cellWidth = 50;
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 100, height: 60, right: 100, bottom: 60 }),
      configurable: true,
    });
    const items = cells.map(({ row, col }) =>
      createGridCell(row * cellHeight, col * cellWidth)
    );
    items.forEach((el) => container.append(el));
    return { container, items };
  }

  it('navigates right within grid', () => {
    const { container, items } = createGridContainer([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);

    const target = getArrowNavigationTarget(items[0], 'ArrowRight', {
      direction: 'grid',
    });
    expect(target).toBe(items[1]);
  });

  it('navigates left within grid', () => {
    const { container, items } = createGridContainer([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);

    const target = getArrowNavigationTarget(items[1], 'ArrowLeft', {
      direction: 'grid',
    });
    expect(target).toBe(items[0]);
  });

  it('navigates down within grid', () => {
    const { container, items } = createGridContainer([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);

    const target = getArrowNavigationTarget(items[0], 'ArrowDown', {
      direction: 'grid',
    });
    expect(target).toBe(items[2]);
  });

  it('navigates up within grid', () => {
    const { container, items } = createGridContainer([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);

    const target = getArrowNavigationTarget(items[3], 'ArrowUp', {
      direction: 'grid',
    });
    expect(target).toBe(items[1]);
  });

  it('stops at grid boundary for right', () => {
    const cell = createGridCell(0, 0, 250, 30);
    const container = document.createElement('div');
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });
    container.append(cell);

    const target = getArrowNavigationTarget(cell, 'ArrowRight', {
      direction: 'grid',
    });
    expect(target).toBeNull();
  });

  it('stops at grid boundary for left', () => {
    const cell = createGridCell(0, 0, 50, 30);
    const container = document.createElement('div');
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });
    container.append(cell);

    const target = getArrowNavigationTarget(cell, 'ArrowLeft', {
      direction: 'grid',
    });
    expect(target).toBeNull();
  });

  it('stops at grid boundary for down when beyond range', () => {
    const cell = createGridCell(0, 0, 50, 30);
    const container = document.createElement('div');
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });
    container.append(cell);

    const target = getArrowNavigationTarget(cell, 'ArrowDown', {
      direction: 'grid',
    });
    expect(target).toBeNull();
  });
});

describe('isVisible edge cases', () => {
  it('returns false when getClientRects is empty', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: 0 });
    Object.defineProperty(el, 'offsetHeight', { value: 0 });
    Object.defineProperty(el, 'getClientRects', { value: () => ({ length: 0 }) });
    expect(isVisible(el)).toBe(false);
  });
});
