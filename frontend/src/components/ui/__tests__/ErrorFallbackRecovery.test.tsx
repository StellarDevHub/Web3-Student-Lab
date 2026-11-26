import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorFallback } from '../ErrorFallback';

describe('ErrorFallback recovery variant (FE-099)', () => {
  it('is an accessible, non-blocking alert dialog with a name and description', () => {
    render(<ErrorFallback variant="recovery" message="Something broke." onRetry={() => {}} />);
    const dialog = screen.getByRole('alertdialog', { name: /ran into a problem/i });
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(dialog).toHaveAccessibleDescription(/Something broke\./);
    expect(dialog).toHaveAccessibleDescription(/rest of the page is still working/i);
  });

  it('moves focus to the dialog when it appears', () => {
    render(<ErrorFallback variant="recovery" onRetry={() => {}} />);
    expect(screen.getByRole('alertdialog')).toHaveFocus();
  });

  it('labels the retry button "Reset & Try Again" by default, and calls onRetry', () => {
    const onRetry = vi.fn();
    render(<ErrorFallback variant="recovery" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset & Try Again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom retry label', () => {
    render(<ErrorFallback variant="recovery" onRetry={() => {}} retryLabel="Reload Component" />);
    expect(screen.getByRole('button', { name: 'Reload Component' })).toBeInTheDocument();
  });

  it('offers no retry button without onRetry, and no report button without onSubmitReport', () => {
    render(<ErrorFallback variant="recovery" />);
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send crash report/i })).not.toBeInTheDocument();
  });

  it('shows a short crash reference when given a report', () => {
    render(
      <ErrorFallback variant="recovery" report={{ id: 'abcd1234-0000-0000-0000-000000000000' }} />
    );
    expect(screen.getByText('abcd1234')).toBeInTheDocument();
  });

  it('renders extra actions next to the retry button', () => {
    render(
      <ErrorFallback
        variant="recovery"
        onRetry={() => {}}
        actions={<a href="/dashboard">Back to safety</a>}
      />
    );
    expect(screen.getByRole('link', { name: 'Back to safety' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  describe('crash report form', () => {
    it('is hidden until requested, toggles with aria-expanded, and limits the comment length', () => {
      render(
        <ErrorFallback
          variant="recovery"
          onSubmitReport={() => ({ delivered: true, recorded: true })}
        />
      );
      const toggle = screen.getByRole('button', { name: /send crash report/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByLabelText(/what were you doing/i)).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByLabelText(/what were you doing/i)).toHaveAttribute('maxlength', '500');
    });

    it('warns the student not to include secrets and says what is sent', () => {
      render(
        <ErrorFallback
          variant="recovery"
          onSubmitReport={() => ({ delivered: true, recorded: true })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /send crash report/i }));
      expect(
        screen.getByText(/don.t include passwords, secret keys or recovery phrases/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/recent clicks and page navigation/i)).toBeInTheDocument();
    });

    it('submits the comment once and then shows the outcome instead of the form', async () => {
      const onSubmitReport = vi.fn().mockResolvedValue({ delivered: true, recorded: true });
      render(<ErrorFallback variant="recovery" onSubmitReport={onSubmitReport} />);
      fireEvent.click(screen.getByRole('button', { name: /send crash report/i }));
      fireEvent.change(screen.getByLabelText(/what were you doing/i), {
        target: { value: 'it froze' },
      });
      fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

      expect(await screen.findByRole('status')).toHaveTextContent('your report was sent');
      expect(onSubmitReport).toHaveBeenCalledWith('it froze');
      expect(screen.queryByLabelText(/what were you doing/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /send crash report/i })).not.toBeInTheDocument();
    });

    it('says plainly when the report was only saved locally', async () => {
      render(
        <ErrorFallback
          variant="recovery"
          onSubmitReport={() => ({ delivered: false, recorded: true })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /send crash report/i }));
      fireEvent.change(screen.getByLabelText(/what were you doing/i), {
        target: { value: 'it froze' },
      });
      fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

      const status = await screen.findByRole('status');
      expect(status).toHaveTextContent(/saved on this device/i);
      expect(status).toHaveTextContent(/has not been sent/i);
    });

    it('keeps submit disabled for a blank comment', () => {
      render(
        <ErrorFallback
          variant="recovery"
          onSubmitReport={() => ({ delivered: true, recorded: true })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /send crash report/i }));
      const submit = screen.getByRole('button', { name: /submit report/i });
      expect(submit).toBeDisabled();
      fireEvent.change(screen.getByLabelText(/what were you doing/i), { target: { value: '   ' } });
      expect(submit).toBeDisabled();
      fireEvent.change(screen.getByLabelText(/what were you doing/i), { target: { value: 'x' } });
      expect(submit).toBeEnabled();
    });
  });

  describe('details visibility', () => {
    it('shows message and component stack only in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const error = new Error('secret internal detail');
      const { unmount } = render(
        <ErrorFallback
          variant="recovery"
          error={error}
          componentStack={'\n    at Widget (widget.tsx:1)'}
        />
      );
      expect(screen.getByText('secret internal detail')).toBeInTheDocument();
      expect(screen.getByText(/at Widget/)).toBeInTheDocument();
      unmount();

      vi.stubEnv('NODE_ENV', 'production');
      render(
        <ErrorFallback
          variant="recovery"
          error={error}
          componentStack={'\n    at Widget (widget.tsx:1)'}
        />
      );
      expect(screen.queryByText('secret internal detail')).not.toBeInTheDocument();
      expect(screen.queryByText(/at Widget/)).not.toBeInTheDocument();
      vi.unstubAllEnvs();
    });
  });

  it('leaves the existing variants unchanged', () => {
    render(<ErrorFallback message="Plain card" onRetry={() => {}} />);
    expect(screen.getByText('Plain card')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
