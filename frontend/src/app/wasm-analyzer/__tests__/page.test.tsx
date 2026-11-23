import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WasmAnalyzerPage from '../page';

// Minimal valid WASM binary: "\0asm" version 1 with export "test_fn"
const createValidWasm = (): Uint8Array => {
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // magic: \0asm
    0x01, 0x00, 0x00, 0x00, // version: 1
    // Type section (id 1, size 4, 1 type: () -> ())
    0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
    // Function section (id 3, size 2, 1 function with type 0)
    0x03, 0x02, 0x01, 0x00,
    // Memory section (id 5, size 3, 1 memory min 1, no max)
    0x05, 0x03, 0x01, 0x00, 0x01,
    // Export section (id 7, size 11, export "test_fn" func 0)
    0x07, 0x0b, 0x01, 0x07, 0x74, 0x65, 0x73, 0x74, 0x5f, 0x66, 0x6e, 0x00, 0x00,
    // Code section (id 10, size 4, 1 code body)
    0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b,
  ]);
};

describe('WasmAnalyzerPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof File !== 'undefined' && !File.prototype.arrayBuffer) {
      File.prototype.arrayBuffer = function () {
        return new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      };
    }
  });

  it('renders the WASM analyzer header and file drop zone', () => {
    render(<WasmAnalyzerPage />);
    expect(screen.getByRole('heading', { level: 1, name: /WASM Analyzer/i })).toBeInTheDocument();
    expect(screen.getByText(/Drop \.wasm contract binary here or click to browse/i)).toBeInTheDocument();
  });

  it('handles dropping a valid wasm file and displays digest, sections, and exports', async () => {
    render(<WasmAnalyzerPage />);

    const wasmBytes = createValidWasm();
    const file = new File([wasmBytes], 'contract.wasm', { type: 'application/wasm' });

    const dropZone = screen.getByText(/Drop \.wasm contract binary here or click to browse/i);

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/File: contract\.wasm/i)).toBeInTheDocument();
    });

    // Displays Bytecode Digest (SHA-256)
    await waitFor(() => {
      expect(screen.getByText(/Bytecode Digest \(SHA-256\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Section headers/i)).toBeInTheDocument();
      expect(screen.getByText(/Exported functions & symbols/i)).toBeInTheDocument();
      expect(screen.getByText(/test_fn/i)).toBeInTheDocument();
      expect(screen.getByText(/Linear memory limits/i)).toBeInTheDocument();
    });
  });

  it('shows error banner when dropping an invalid file', async () => {
    render(<WasmAnalyzerPage />);

    const invalidBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const file = new File([invalidBytes], 'bad.wasm', { type: 'application/wasm' });

    const dropZone = screen.getByText(/Drop \.wasm contract binary here or click to browse/i);

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Cannot parse module/i)).toBeInTheDocument();
      expect(screen.getByText(/missing the \\0asm magic number/i)).toBeInTheDocument();
    });
  });
});
