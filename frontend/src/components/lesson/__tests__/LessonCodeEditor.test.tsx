import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockExtendRustLanguage = vi.fn();
const mockRegisterCompletion = vi.fn();

// Replace the dynamically-imported Monaco editor with a lightweight stand-in:
// a textarea wired to the same `value` / `onChange` / `onMount` contract.
vi.mock('next/dynamic', () => ({
  default: () => {
    const MockEditor = (props: any) => (
      <div data-testid="monaco-editor" data-language={props.language}>
        <button
          data-testid="mock-mount"
          onClick={() => props.onMount?.({}, { languages: {}, editor: {} })}
        >
          mount
        </button>
        <textarea
          data-testid="editor-textarea"
          value={props.value}
          onChange={(e) => props.onChange?.(e.target.value)}
        />
      </div>
    );
    MockEditor.displayName = 'DynamicEditor';
    return MockEditor;
  },
}));

vi.mock('@/lib/editor/SorobanLanguage', () => ({
  extendRustLanguage: mockExtendRustLanguage,
}));
vi.mock('@/lib/editor/SorobanCompletion', () => ({
  registerSorobanCompletion: mockRegisterCompletion,
}));

import { LessonCodeEditor } from '../LessonCodeEditor';

describe('LessonCodeEditor', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('renders the editor with the Rust language and starter code', () => {
    render(<LessonCodeEditor initialCode="fn main() {}" />);
    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toHaveAttribute('data-language', 'rust');
    expect(screen.getByTestId('editor-textarea')).toHaveValue('fn main() {}');
  });

  it('registers Rust highlighting and autocomplete on mount', () => {
    render(<LessonCodeEditor initialCode="fn main() {}" />);
    fireEvent.click(screen.getByTestId('mock-mount'));
    expect(mockExtendRustLanguage).toHaveBeenCalledTimes(1);
    expect(mockRegisterCompletion).toHaveBeenCalledTimes(1);
  });

  it('reports state modifications through onChange', () => {
    const onChange = vi.fn();
    render(<LessonCodeEditor initialCode="start" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('editor-textarea'), { target: { value: 'edited' } });
    expect(onChange).toHaveBeenLastCalledWith('edited');
    expect(screen.getByTestId('editor-textarea')).toHaveValue('edited');
  });

  it('reset restores the starter code and is disabled until edited', () => {
    const onChange = vi.fn();
    render(<LessonCodeEditor initialCode="start" onChange={onChange} />);
    const reset = screen.getByRole('button', { name: /reset code/i });
    expect(reset).toBeDisabled();

    fireEvent.change(screen.getByTestId('editor-textarea'), { target: { value: 'changed' } });
    expect(reset).toBeEnabled();

    fireEvent.click(reset);
    expect(screen.getByTestId('editor-textarea')).toHaveValue('start');
    expect(onChange).toHaveBeenLastCalledWith('start');
  });
});
