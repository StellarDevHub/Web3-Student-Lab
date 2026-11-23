import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FocusTrap } from '../FocusTrap';

describe('FocusTrap', () => {
  it('renders children', () => {
    render(
      <FocusTrap>
        <button>Button 1</button>
        <button>Button 2</button>
      </FocusTrap>
    );

    expect(screen.getByText('Button 1')).toBeInTheDocument();
    expect(screen.getByText('Button 2')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <FocusTrap className="custom-trap">
        <button>Click</button>
      </FocusTrap>
    );

    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('custom-trap');
  });

  it('renders with additional props', () => {
    render(
      <FocusTrap data-testid="focus-trap">
        <button>Click</button>
      </FocusTrap>
    );

    expect(screen.getByTestId('focus-trap')).toBeInTheDocument();
  });

  it('supports onEscape callback', () => {
    const onEscape = vi.fn();
    render(
      <FocusTrap data-testid="focus-trap" onEscape={onEscape}>
        <button>Button 1</button>
        <button>Button 2</button>
      </FocusTrap>
    );

    const container = screen.getByTestId('focus-trap');
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onEscape).toHaveBeenCalled();
  });
});
