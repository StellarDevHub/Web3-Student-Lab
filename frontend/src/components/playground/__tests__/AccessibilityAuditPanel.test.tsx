import type { AuditResult } from '@/lib/editor/SorobanAccessibilityAuditor';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityAuditPanel } from '../AccessibilityAuditPanel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PASSING_RESULT: AuditResult = {
  issues: [],
  counts: { error: 0, warning: 0, info: 0 },
  hasIssues: false,
  passed: true,
};

const FAILING_RESULT: AuditResult = {
  issues: [
    {
      rule: 'panic-only-error-handling',
      severity: 'error',
      message: '`panic!()` detected in contract code.',
      suggestion: 'Return a Result<T, ContractError> instead.',
      line: 5,
      column: 5,
    },
    {
      rule: 'missing-fn-doc',
      severity: 'warning',
      message: 'Public contract function `transfer` is missing a documentation comment.',
      suggestion: 'Add a /// doc comment above `pub fn transfer`.',
      line: 10,
    },
    {
      rule: 'undocumented-error-enum',
      severity: 'info',
      message: 'Error enum `ContractError` has no documentation comment.',
      suggestion: 'Add a /// comment above #[contracterror].',
      line: 15,
    },
  ],
  counts: { error: 1, warning: 1, info: 1 },
  hasIssues: true,
  passed: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Rendering states
// ---------------------------------------------------------------------------

describe('AccessibilityAuditPanel — rendering', () => {
  it('renders the panel heading', () => {
    render(<AccessibilityAuditPanel result={null} isPending={false} />);
    expect(screen.getByRole('heading', { name: /accessibility audit/i })).toBeInTheDocument();
  });

  it('shows placeholder text when no result and not pending', () => {
    render(<AccessibilityAuditPanel result={null} isPending={false} />);
    expect(
      screen.getByText(/accessibility audit will run automatically/i)
    ).toBeInTheDocument();
  });

  it('shows loading indicator when isPending is true and no result', () => {
    render(<AccessibilityAuditPanel result={null} isPending={true} />);
    expect(screen.getByText(/auditing contract/i)).toBeInTheDocument();
  });

  it('shows passed state when result has no issues', () => {
    render(<AccessibilityAuditPanel result={PASSING_RESULT} isPending={false} />);
    expect(screen.getByText(/all checks passed/i)).toBeInTheDocument();
  });

  it('shows issue count when result has issues', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    expect(screen.getByText(/3 issues/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Severity badges
// ---------------------------------------------------------------------------

describe('AccessibilityAuditPanel — severity badges', () => {
  it('renders error badge with correct count', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    // aria-label format: "1 error"
    expect(screen.getByLabelText(/1 error/i)).toBeInTheDocument();
  });

  it('renders warning badge with correct count', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    expect(screen.getByLabelText(/1 warning/i)).toBeInTheDocument();
  });

  it('renders info badge with correct count', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    expect(screen.getByLabelText(/1 info/i)).toBeInTheDocument();
  });

  it('does not render badges when result has no issues', () => {
    render(<AccessibilityAuditPanel result={PASSING_RESULT} isPending={false} />);
    expect(screen.queryByLabelText(/\d+ error/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Issue list
// ---------------------------------------------------------------------------

describe('AccessibilityAuditPanel — issue list', () => {
  it('renders all issues in the "All" tab by default', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    // Each issue row is a button with the issue message as text
    expect(screen.getByText(/panic!.*detected/i)).toBeInTheDocument();
    expect(screen.getByText(/transfer.*missing a documentation comment/i)).toBeInTheDocument();
    expect(screen.getByText(/ContractError.*has no documentation/i)).toBeInTheDocument();
  });

  it('error issues are expanded by default (shows suggestion)', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    // The error issue has defaultExpanded=true, so its suggestion should be visible
    expect(screen.getByText(/Return a Result/i)).toBeInTheDocument();
  });

  it('non-error issues are collapsed by default', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    // The warning suggestion should not be visible until expanded
    expect(screen.queryByText(/Add a \/\/\/ doc comment above/i)).not.toBeInTheDocument();
  });

  it('expands a collapsed issue on click', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    // Find the warning issue button
    const warningBtn = screen.getByText(/transfer.*missing a documentation comment/i).closest('button');
    expect(warningBtn).toBeDefined();
    fireEvent.click(warningBtn!);
    expect(screen.getByText(/Add a \/\/\/ doc comment above/i)).toBeInTheDocument();
  });

  it('collapses an expanded issue on second click', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    // The error issue is already expanded; click to collapse
    const errorBtn = screen.getByText(/panic!.*detected/i).closest('button');
    fireEvent.click(errorBtn!);
    expect(screen.queryByText(/Return a Result/i)).not.toBeInTheDocument();
  });

  it('shows line numbers in the issue metadata', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    expect(screen.getByText(/Line 5/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

describe('AccessibilityAuditPanel — filter tabs', () => {
  it('renders All, Errors, Warnings, Info tabs', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    expect(screen.getByRole('tab', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /errors/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /warnings/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /info/i })).toBeInTheDocument();
  });

  it('the All tab is selected by default', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    expect(screen.getByRole('tab', { name: /all/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking Errors tab filters to only error issues', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    fireEvent.click(screen.getByRole('tab', { name: /errors/i }));
    expect(screen.getByText(/panic!.*detected/i)).toBeInTheDocument();
    expect(screen.queryByText(/transfer.*missing a documentation comment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ContractError.*has no documentation/i)).not.toBeInTheDocument();
  });

  it('clicking Warnings tab filters to only warning issues', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    fireEvent.click(screen.getByRole('tab', { name: /warnings/i }));
    expect(screen.queryByText(/panic!.*detected/i)).not.toBeInTheDocument();
    expect(screen.getByText(/transfer.*missing a documentation comment/i)).toBeInTheDocument();
  });

  it('clicking Info tab filters to only info issues', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    fireEvent.click(screen.getByRole('tab', { name: /info/i }));
    expect(screen.queryByText(/panic!.*detected/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ContractError.*has no documentation/i)).toBeInTheDocument();
  });

  it('shows empty message when filter yields no issues', () => {
    const onlyError: AuditResult = {
      ...FAILING_RESULT,
      issues: [FAILING_RESULT.issues[0]],
      counts: { error: 1, warning: 0, info: 0 },
    };
    render(<AccessibilityAuditPanel result={onlyError} isPending={false} />);
    fireEvent.click(screen.getByRole('tab', { name: /warnings/i }));
    expect(screen.getByText(/no warning issues found/i)).toBeInTheDocument();
  });

  it('resets to "All" tab when a new result is received', async () => {
    const { rerender } = render(
      <AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />
    );
    fireEvent.click(screen.getByRole('tab', { name: /errors/i }));
    expect(screen.getByRole('tab', { name: /errors/i })).toHaveAttribute('aria-selected', 'true');

    rerender(<AccessibilityAuditPanel result={PASSING_RESULT} isPending={false} />);
    // Passing result shows "All checks passed" — no tabs rendered
    expect(screen.getByText(/all checks passed/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Refresh button
// ---------------------------------------------------------------------------

describe('AccessibilityAuditPanel — refresh button', () => {
  it('renders a re-run button when onRunAudit is provided', () => {
    render(
      <AccessibilityAuditPanel
        result={PASSING_RESULT}
        isPending={false}
        onRunAudit={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /re-run accessibility audit/i })).toBeInTheDocument();
  });

  it('calls onRunAudit when the refresh button is clicked', () => {
    const onRunAudit = vi.fn();
    render(
      <AccessibilityAuditPanel
        result={PASSING_RESULT}
        isPending={false}
        onRunAudit={onRunAudit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /re-run accessibility audit/i }));
    expect(onRunAudit).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button while isPending is true', () => {
    render(
      <AccessibilityAuditPanel
        result={null}
        isPending={true}
        onRunAudit={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /re-run accessibility audit/i })).toBeDisabled();
  });

  it('does not render re-run button when onRunAudit is not provided', () => {
    render(<AccessibilityAuditPanel result={PASSING_RESULT} isPending={false} />);
    expect(screen.queryByRole('button', { name: /re-run accessibility audit/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Accessibility (ARIA) attributes
// ---------------------------------------------------------------------------

describe('AccessibilityAuditPanel — ARIA', () => {
  it('root element is a <section> with aria-labelledby pointing to the heading', () => {
    const { container } = render(
      <AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />
    );
    const section = container.querySelector('section');
    expect(section).toBeInTheDocument();
    const labelledby = section!.getAttribute('aria-labelledby');
    expect(labelledby).toBeTruthy();
    const heading = document.getElementById(labelledby!);
    expect(heading).toBeInTheDocument();
    expect(heading!.textContent).toMatch(/accessibility audit/i);
  });

  it('issue rows have aria-expanded attribute', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    // The error issue button should have aria-expanded=true
    const errorBtn = screen.getByText(/panic!.*detected/i).closest('button');
    expect(errorBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('the tablist has an accessible label', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    expect(
      screen.getByRole('tablist', { name: /filter audit issues by severity/i })
    ).toBeInTheDocument();
  });

  it('severity badges have aria-label', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    // aria-label is "1 errors" or "1 error" depending on singular/plural
    const badgesContainer = screen.getByRole('status', { name: /issue counts by severity/i });
    expect(badgesContainer).toBeInTheDocument();
  });

  it('the issues list has a descriptive aria-label', () => {
    render(<AccessibilityAuditPanel result={FAILING_RESULT} isPending={false} />);
    expect(screen.getByRole('list', { name: /3 audit issues/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Custom className prop
// ---------------------------------------------------------------------------

describe('AccessibilityAuditPanel — className', () => {
  it('applies a custom className to the root section', () => {
    const { container } = render(
      <AccessibilityAuditPanel result={null} isPending={false} className="my-custom-class" />
    );
    expect(container.querySelector('section')).toHaveClass('my-custom-class');
  });
});
