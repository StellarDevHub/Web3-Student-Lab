import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSorobanLinter } from '../SorobanLinter';

function createMockModel(initialContent = '') {
  let content = initialContent;
  const listeners: Array<() => void> = [];

  return {
    getValue: () => content,
    setValue: (newContent: string) => {
      content = newContent;
      listeners.forEach((fn) => fn());
    },
    onDidChangeContent: vi.fn((listener: () => void) => {
      listeners.push(listener);
      return { dispose: vi.fn() };
    }),
  };
}

const mockMonaco = {
  editor: {
    setModelMarkers: vi.fn(),
  },
  MarkerSeverity: {
    Error: 1,
    Warning: 2,
    Info: 3,
    Hint: 4,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSorobanLinter', () => {
  it('should set a marker for missing #[contract] attribute above a contract struct', () => {
    const model = createMockModel(
      'use soroban_sdk::{};\n\npub struct MyContract;'
    );
    const linter = createSorobanLinter({
      model: model as any,
      monacoApi: mockMonaco as any,
      debounceMs: 300,
    });

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalled();
    const call = mockMonaco.editor.setModelMarkers.mock.calls.find(
      (c: [any, string, any[]]) => c[1] === 'soroban-linter'
    );
    expect(call).toBeDefined();
    const markers = call[2];
    const missingContractMarker = markers.find((m: any) =>
      m.message.includes('#[contract]')
    );
    expect(missingContractMarker).toBeDefined();
    expect(missingContractMarker.severity).toBe(2);

    linter.dispose();
  });

  it('should NOT set a marker when #[contract] is correctly present', () => {
    const model = createMockModel(
      'use soroban_sdk::{};\n\n#[contract]\npub struct MyContract;'
    );
    createSorobanLinter({
      model: model as any,
      monacoApi: mockMonaco as any,
      debounceMs: 300,
    });

    const call = mockMonaco.editor.setModelMarkers.mock.calls.find(
      (c: [any, string, any[]]) => c[1] === 'soroban-linter'
    );
    const markers = call[2];
    const missingContractMarker = markers.find((m: any) =>
      m.message.includes('#[contract]')
    );
    expect(missingContractMarker).toBeUndefined();
  });

  it('should clear markers when contract structure is corrected', () => {
    const model = createMockModel(
      'use soroban_sdk::{};\n\npub struct MyContract;'
    );
    createSorobanLinter({
      model: model as any,
      monacoApi: mockMonaco as any,
      debounceMs: 300,
    });

    const initialMarkers = mockMonaco.editor.setModelMarkers.mock.calls.find(
      (c: [any, string, any[]]) => c[1] === 'soroban-linter'
    )?.[2];
    expect(
      initialMarkers.some((m: any) => m.message.includes('#[contract]'))
    ).toBe(true);

    model.setValue(
      'use soroban_sdk::{};\n\n#[contract]\npub struct MyContract;'
    );

    vi.advanceTimersByTime(300);

    const updatedCalls = mockMonaco.editor.setModelMarkers.mock.calls.filter(
      (c: [any, string, any[]]) => c[1] === 'soroban-linter'
    );
    const latestMarkers = updatedCalls[updatedCalls.length - 1][2];
    expect(
      latestMarkers.some((m: any) => m.message.includes('#[contract]'))
    ).toBe(false);
  });

  it('should flag std:: usage as error', () => {
    const model = createMockModel(
      'use std::collections::HashMap;\nfn f() {}'
    );
    createSorobanLinter({
      model: model as any,
      monacoApi: mockMonaco as any,
      debounceMs: 300,
    });

    const call = mockMonaco.editor.setModelMarkers.mock.calls.find(
      (c: [any, string, any[]]) => c[1] === 'soroban-linter'
    );
    const markers = call[2];
    const stdMarker = markers.find((m: any) =>
      m.message.includes('std::')
    );
    expect(stdMarker).toBeDefined();
    expect(stdMarker.severity).toBe(1);
  });

  it('should flag std::collections::HashMap and suggest soroban_sdk::Map', () => {
    const model = createMockModel(
      'let map: std::collections::HashMap<String, u32>;'
    );
    createSorobanLinter({
      model: model as any,
      monacoApi: mockMonaco as any,
      debounceMs: 300,
    });

    const call = mockMonaco.editor.setModelMarkers.mock.calls.find(
      (c: [any, string, any[]]) => c[1] === 'soroban-linter'
    );
    const markers = call[2];
    const stdMarker = markers.find((m: any) =>
      m.message.includes('std::collections::HashMap')
    );
    expect(stdMarker).toBeDefined();
    expect(stdMarker.message).toContain('soroban_sdk::Map');
  });

  it('should not flag std:: when code has no soroban context', () => {
    const model = createMockModel(
      'fn f() {\n    let x = std::mem::swap;\n}'
    );
    createSorobanLinter({
      model: model as any,
      monacoApi: mockMonaco as any,
      debounceMs: 300,
    });

    const call = mockMonaco.editor.setModelMarkers.mock.calls.find(
      (c: [any, string, any[]]) => c[1] === 'soroban-linter'
    );
    const markers = call[2];
    const stdMarker = markers.find((m: any) =>
      m.message.includes('std::')
    );
    expect(stdMarker).toBeDefined();
  });

  it('should debounce content changes at 300ms minimum', () => {
    const model = createMockModel('use soroban_sdk::{};\npub struct C;');
    createSorobanLinter({
      model: model as any,
      monacoApi: mockMonaco as any,
      debounceMs: 300,
    });

    const initialCallCount =
      mockMonaco.editor.setModelMarkers.mock.calls.length;

    model.setValue('use soroban_sdk::{};\n#[contract]\npub struct C;');
    model.setValue('use soroban_sdk::{};\npub struct C;');
    model.setValue('use soroban_sdk::{};\n#[contract]\npub struct C;');

    expect(mockMonaco.editor.setModelMarkers.mock.calls.length).toBe(
      initialCallCount
    );

    vi.advanceTimersByTime(300);

    expect(mockMonaco.editor.setModelMarkers.mock.calls.length).toBe(
      initialCallCount + 1
    );
  });

  it('should clear markers on dispose', () => {
    const model = createMockModel('use soroban_sdk::{};\npub struct C;');
    const linter = createSorobanLinter({
      model: model as any,
      monacoApi: mockMonaco as any,
      debounceMs: 300,
    });

    linter.dispose();

    const clearCall = mockMonaco.editor.setModelMarkers.mock.calls.find(
      (c: [any, string, any[]]) => c[1] === 'soroban-linter' && c[2].length === 0
    );
    expect(clearCall).toBeDefined();
  });

  it('should not crash when setModelMarkers throws', () => {
    const throwingMonaco = {
      editor: {
        setModelMarkers: vi.fn(() => {
          throw new Error('marker error');
        }),
      },
      MarkerSeverity: mockMonaco.MarkerSeverity,
    };

    const model = createMockModel('use soroban_sdk::{};\npub struct C;');
    const linter = createSorobanLinter({
      model: model as any,
      monacoApi: throwingMonaco as any,
      debounceMs: 300,
    });

    expect(() => {
      linter.run();
    }).not.toThrow();
  });

  it('should not set markers after dispose', () => {
    const model = createMockModel('use soroban_sdk::{};\npub struct C;');
    const linter = createSorobanLinter({
      model: model as any,
      monacoApi: mockMonaco as any,
      debounceMs: 300,
    });

    linter.dispose();

    model.setValue('use soroban_sdk::{};\n#[contract]\npub struct C;');
    vi.advanceTimersByTime(300);

    const callCount = mockMonaco.editor.setModelMarkers.mock.calls.length;
    model.setValue('use soroban_sdk::{};\npub struct C;');
    vi.advanceTimersByTime(300);

    expect(mockMonaco.editor.setModelMarkers.mock.calls.length).toBe(
      callCount
    );
  });

  it('should run initial lint synchronously', () => {
    const model = createMockModel('use soroban_sdk::{};\npub struct C;');
    createSorobanLinter({
      model: model as any,
      monacoApi: mockMonaco as any,
      debounceMs: 300,
    });

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledTimes(1);
  });
});
