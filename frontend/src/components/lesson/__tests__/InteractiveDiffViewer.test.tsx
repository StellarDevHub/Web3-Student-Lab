import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Replace the dynamically-imported Monaco DiffEditor with a lightweight stand-in.
vi.mock('next/dynamic', () => ({
  default: () => {
    const MockDiffEditor = (props: any) => (
      <div
        data-testid="monaco-diff"
        data-side-by-side={props.options?.renderSideBySide}
        data-theme={props.theme}
        data-language={props.language}
      >
        <button data-testid="mock-mount" onClick={() => props.onMount?.({}, { editor: { defineTheme: vi.fn(), getTheme: () => undefined } })}>
          mount
        </button>
      </div>
    );
    MockDiffEditor.displayName = 'MockDiffEditor';
    return MockDiffEditor;
  },
}));

vi.mock('@/hooks/useDiffWorker', () => ({
  useDiffWorker: () => vi.fn(),
}));

import { InteractiveDiffViewer, type DiffChunk } from '../InteractiveDiffViewer';
import { useDiffWorker } from '@/hooks/useDiffWorker';

const chunks: DiffChunk[] = [
  {
    id: 'chunk-0',
    kind: 'replace',
    startLineOriginal: 2,
    startLineModified: 2,
    originalLines: ['    let a = 1;\n'],
    modifiedLines: ['    let a = 2;\n'],
    segments: [{ text: 'let a =', kind: 'same' }, { text: '2', kind: 'add' }],
  },
];

const mockedComputeDiff = vi.mocked(vi.fn());

beforeEach(() => {
  vi.clearAllMocks();
  (useDiffWorker as ReturnType<typeof vi.fn>).mockReturnValue(mockedComputeDiff);
  mockedComputeDiff.mockResolvedValue({ chunks, identical: false });
});

afterEach(() => cleanup());

describe('InteractiveDiffViewer', () => {
  it('renders the Monaco diff with the requested language and theme', () => {
    render(
      <InteractiveDiffViewer original="fn main() {}" modified="fn main() {}" language="rust" filename="lib.rs" theme="dark" />
    );
    const diff = screen.getByTestId('monaco-diff');
    expect(diff).toHaveAttribute('data-language', 'rust');
    expect(diff).toHaveAttribute('data-theme', 'vs-dark');
    expect(diff).toHaveAttribute('data-side-by-side', 'true');
  });

  it('toggles between side-by-side and inline views', () => {
    render(<InteractiveDiffViewer original="a" modified="b" />);
    fireEvent.click(screen.getByRole('button', { name: /inline/i }));
    expect(screen.getByTestId('monaco-diff')).toHaveAttribute('data-side-by-side', 'false');
    fireEvent.click(screen.getByRole('button', { name: /side-by-side/i }));
    expect(screen.getByTestId('monaco-diff')).toHaveAttribute('data-side-by-side', 'true');
  });

  it('maps the OLED theme to the custom Monaco theme', () => {
    render(<InteractiveDiffViewer original="a" modified="b" theme="oled" />);
    expect(screen.getByTestId('monaco-diff')).toHaveAttribute('data-theme', 'oled-diff-theme');
  });

  it('computes chunks via the diff worker', async () => {
    render(<InteractiveDiffViewer original="let a = 1;" modified="let a = 2;" />);
    await waitFor(() => {
      expect(mockedComputeDiff).toHaveBeenCalledWith('let a = 1;', 'let a = 2;');
    });
    expect(await screen.findByRole('button', { name: /apply chunk at line 2/i })).toBeInTheDocument();
  });

  it('applies a chunk and merges solution lines into the buffer', async () => {
    const onApplyChunk = vi.fn();
    render(
      <InteractiveDiffViewer
        original={'fn main() {\n    let a = 1;\n}\n'}
        modified={'fn main() {\n    let a = 2;\n}\n'}
        onApplyChunk={onApplyChunk}
      />
    );

    const applyButton = await screen.findByRole('button', { name: /apply chunk at line 2/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(onApplyChunk).toHaveBeenCalled();
      const [, merged] = onApplyChunk.mock.calls[0] as [DiffChunk, string];
      expect(merged).toContain('let a = 2;');
    });
    // Button flips to the applied state.
    expect(screen.getByRole('button', { name: /applied/i })).toBeInTheDocument();
  });

  it('marks the diff as fully applied when every chunk is applied', async () => {
    render(<InteractiveDiffViewer original="a" modified="b" />);
    const applyButton = await screen.findByRole('button', { name: /apply chunk at line 2/i });
    fireEvent.click(applyButton);
    expect(await screen.findByText(/all changes applied/i)).toBeInTheDocument();
  });

  it('shows an error banner when the worker fails', async () => {
    mockedComputeDiff.mockRejectedValue(new Error('boom'));
    render(<InteractiveDiffViewer original="a" modified="b" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not compute the diff/i);
  });
});
