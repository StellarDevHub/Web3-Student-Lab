import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflineNotification } from './OfflineNotification';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('OfflineNotification', () => {
  beforeEach(() => {
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('renders nothing on initial mount while online', () => {
    render(<OfflineNotification />);
    expect(screen.queryByText('Offline Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Back Online')).not.toBeInTheDocument();
  });

  it('shows an accessible offline notice when the browser goes offline', () => {
    render(<OfflineNotification />);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Offline Mode');
    expect(notice).toHaveAttribute('aria-live', 'polite');
  });

  it('shows a "Back Online" notice, then auto-hides, when connectivity returns', () => {
    vi.useFakeTimers();
    try {
      render(<OfflineNotification autoHideDuration={1000} />);

      act(() => {
        setOnline(false);
        window.dispatchEvent(new Event('offline'));
      });
      expect(screen.getByText('Offline Mode')).toBeInTheDocument();

      act(() => {
        setOnline(true);
        window.dispatchEvent(new Event('online'));
      });
      expect(screen.getByText('Back Online')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByText('Back Online')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not show a duplicate/repeated notice for repeated offline events while already offline', () => {
    render(<OfflineNotification />);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getAllByText('Offline Mode')).toHaveLength(1);
  });

  it('dismisses the notice via the close button and calls onClose', () => {
    const onClose = vi.fn();
    render(<OfflineNotification onClose={onClose} />);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('Offline Mode')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close notification'));

    expect(screen.queryByText('Offline Mode')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reloads the page when retrying and the browser already reports online', () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: reloadSpy },
    });

    render(<OfflineNotification />);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    act(() => {
      setOnline(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
