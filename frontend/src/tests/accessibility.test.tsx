import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';

import {
  CompilerTerminal,
  type CompileLogEntry,
} from '@/components/editor/CompilerTerminal';
import { SkipLink, SkipLinkTarget } from '@/components/ui/SkipLink';

expect.extend(toHaveNoViolations);

describe('CompilerTerminal - ARIA 1.2 Live Regions & Assistive Technology (FE-078)', () => {
  const sampleLogs: CompileLogEntry[] = [
    {
      id: 'log-1',
      level: 'info',
      message: 'Compiling soroban-token v0.1.0 (src/lib.rs)...',
      timestamp: '12:00:01',
    },
    {
      id: 'log-2',
      level: 'error',
      message: 'error[E0308]: mismatched types at src/contract.rs:18:5',
      timestamp: '12:00:02',
      line: 18,
      column: 5,
    },
    {
      id: 'log-3',
      level: 'error',
      message: 'error[E0425]: cannot find value `symbol` in this scope at src/contract.rs:24:9',
      timestamp: '12:00:03',
      line: 24,
      column: 9,
    },
    {
      id: 'log-4',
      level: 'info',
      message: 'warning: unused variable `balance`',
      timestamp: '12:00:04',
    },
  ];

  it('renders streaming log with ARIA 1.2 aria-live="polite" and aria-atomic="false"', () => {
    render(<CompilerTerminal logs={sampleLogs} />);

    const logViewport = screen.getByTestId('terminal-log-viewport');
    expect(logViewport).toBeInTheDocument();
    expect(logViewport).toHaveAttribute('role', 'log');
    expect(logViewport).toHaveAttribute('aria-live', 'polite');
    expect(logViewport).toHaveAttribute('aria-atomic', 'false');
    expect(logViewport).toHaveAttribute('aria-label', 'Streaming compilation and WASM execution logs');
  });

  it('renders dedicated polite live announcer with aria-atomic="true"', () => {
    render(<CompilerTerminal logs={sampleLogs} />);

    const announcer = screen.getByTestId('terminal-live-announcer');
    expect(announcer).toBeInTheDocument();
    expect(announcer).toHaveAttribute('role', 'status');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveAttribute('aria-atomic', 'true');
  });

  it('announces compilation status transitions without requiring focus shift', () => {
    const { rerender } = render(<CompilerTerminal logs={[]} isCompiling={false} />);

    const announcer = screen.getByTestId('terminal-live-announcer');

    // Transition to compiling
    rerender(<CompilerTerminal logs={[]} isCompiling={true} />);
    expect(announcer).toHaveTextContent(/Compilation and WASM execution started/i);

    // Transition to failed with error count
    rerender(<CompilerTerminal logs={sampleLogs} isCompiling={false} />);
    expect(announcer).toHaveTextContent(/Compilation failed with 2 errors/i);
    expect(announcer).toHaveTextContent(/Alt\+E/i);
  });

  it('announces test outcomes (pass/fail counts) to assistive technologies', () => {
    const { rerender } = render(
      <CompilerTerminal
        logs={sampleLogs}
        testResults={{ passed: 5, failed: 0, total: 5, durationMs: 1420 }}
      />
    );

    const announcer = screen.getByTestId('terminal-live-announcer');
    expect(announcer).toHaveTextContent(/5 passed, 0 failed out of 5 in 1.42 seconds/i);

    // Update with failing tests
    rerender(
      <CompilerTerminal
        logs={sampleLogs}
        testResults={{ passed: 4, failed: 2, total: 6, durationMs: 2100 }}
      />
    );
    expect(announcer).toHaveTextContent(/4 passed, 2 failed out of 6/i);
  });

  it('supports accessible keyboard navigation to jump between compiler error lines', () => {
    const onJumpToLine = vi.fn();

    render(<CompilerTerminal logs={sampleLogs} onJumpToLine={onJumpToLine} />);

    const announcer = screen.getByTestId('terminal-live-announcer');
    const nextErrorBtn = screen.getByRole('button', {
      name: /Jump to next compiler error/i,
    });
    const prevErrorBtn = screen.getByRole('button', {
      name: /Jump to previous compiler error/i,
    });

    // 1. Click Next Error button
    fireEvent.click(nextErrorBtn);
    expect(onJumpToLine).toHaveBeenCalledWith(18, 5);
    expect(announcer).toHaveTextContent(/Jumped to error 1 of 2 at line 18, column 5/i);

    // 2. Click Next Error button again to advance
    fireEvent.click(nextErrorBtn);
    expect(onJumpToLine).toHaveBeenCalledWith(24, 9);
    expect(announcer).toHaveTextContent(/Jumped to error 2 of 2 at line 24, column 9/i);

    // 3. Click Previous Error button
    fireEvent.click(prevErrorBtn);
    expect(onJumpToLine).toHaveBeenCalledWith(18, 5);
    expect(announcer).toHaveTextContent(/Jumped to error 1 of 2 at line 18, column 5/i);
  });

  it('handles Alt+E and Alt+Shift+E keyboard shortcuts for error navigation', () => {
    const onJumpToLine = vi.fn();

    render(<CompilerTerminal logs={sampleLogs} onJumpToLine={onJumpToLine} />);

    const terminalSection = screen.getByTestId('compiler-terminal');
    const announcer = screen.getByTestId('terminal-live-announcer');

    // Trigger Alt+E (Next Error)
    fireEvent.keyDown(terminalSection, { key: 'e', altKey: true });
    expect(onJumpToLine).toHaveBeenCalledWith(18, 5);
    expect(announcer).toHaveTextContent(/Jumped to error 1 of 2/i);

    // Trigger Alt+E again
    fireEvent.keyDown(terminalSection, { key: 'e', altKey: true });
    expect(onJumpToLine).toHaveBeenCalledWith(24, 9);
    expect(announcer).toHaveTextContent(/Jumped to error 2 of 2/i);

    // Trigger Alt+Shift+E (Previous Error)
    fireEvent.keyDown(terminalSection, { key: 'e', altKey: true, shiftKey: true });
    expect(onJumpToLine).toHaveBeenCalledWith(18, 5);
    expect(announcer).toHaveTextContent(/Jumped to error 1 of 2/i);
  });

  it('passes automated axe-core accessibility audit with 0 violations', async () => {
    const { container } = render(
      <main>
        <CompilerTerminal
          logs={sampleLogs}
          isCompiling={false}
          testResults={{ passed: 4, failed: 2, total: 6 }}
        />
      </main>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('SkipLink - ARIA 1.2 Focus Management & Live Regions (FE-078)', () => {
  it('renders skip links with semantic navigation and polite live region', () => {
    render(
      <SkipLink
        targets={[
          { id: 'code-editor', label: 'Skip to code editor' },
          { id: 'compiler-terminal', label: 'Skip to compiler terminal' },
        ]}
      />
    );

    const nav = screen.getByRole('navigation', { name: /Skip navigation links/i });
    expect(nav).toBeInTheDocument();

    const liveRegion = screen.getByTestId('skip-link-live-region');
    expect(liveRegion).toHaveAttribute('role', 'status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
  });

  it('announces destination and focuses target element on click', () => {
    render(
      <div>
        <SkipLink
          targets={[
            { id: 'compiler-terminal', label: 'Skip to compiler terminal' },
          ]}
        />
        <SkipLinkTarget id="main-content">
          <h1>Main Content Area</h1>
        </SkipLinkTarget>
        <SkipLinkTarget id="compiler-terminal">
          <h2>Compiler Terminal Target</h2>
        </SkipLinkTarget>
      </div>
    );

    const terminalLink = screen.getByRole('link', { name: /Skip to compiler terminal/i });
    const liveRegion = screen.getByTestId('skip-link-live-region');

    fireEvent.click(terminalLink);

    expect(liveRegion).toHaveTextContent(/Navigated to Skip to compiler terminal/i);
    const terminalTarget = document.getElementById('compiler-terminal');
    expect(document.activeElement).toBe(terminalTarget);
  });

  it('passes automated axe-core accessibility audit with 0 violations', async () => {
    const { container } = render(
      <div>
        <header>
          <SkipLink
            targets={[
              { id: 'main-content', label: 'Skip to main content' },
              { id: 'compiler-terminal', label: 'Skip to compiler terminal' },
            ]}
          />
        </header>
        <main>
          <SkipLinkTarget id="main-content">
            <h1>Web3 Student Lab</h1>
            <p>Accessible playground and WASM compilation environment.</p>
          </SkipLinkTarget>
          <SkipLinkTarget id="compiler-terminal">
            <CompilerTerminal logs={[]} isCompiling={false} />
          </SkipLinkTarget>
        </main>
      </div>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
