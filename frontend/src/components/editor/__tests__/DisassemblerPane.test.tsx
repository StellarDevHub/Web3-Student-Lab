import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DisassemblerPane } from '../DisassemblerPane';

describe('DisassemblerPane', () => {
  it('loads the demo contract and steps the operand stack', () => {
    render(<DisassemblerPane />);

    expect(screen.getByText(/WASM Opcode Debugger/i)).toBeInTheDocument();
    expect(screen.getByText('demo-add.wasm')).toBeInTheDocument();
    expect(screen.getByText('Operand stack (0)')).toBeInTheDocument();

    const stepForward = screen.getByRole('button', { name: /step forwards/i });
    fireEvent.click(stepForward);
    fireEvent.click(stepForward);

    expect(screen.getByText('Operand stack (2)')).toBeInTheDocument();
    expect(screen.getAllByText('i32.const').length).toBeGreaterThan(0);
  });

  it('toggles a breakpoint from an instruction offset', () => {
    render(<DisassemblerPane />);

    const breakpoint = screen.getAllByRole('button', { name: /set breakpoint at/i })[0];
    fireEvent.click(breakpoint);

    expect(screen.getAllByRole('button', { name: /remove breakpoint at/i }).length).toBeGreaterThan(
      0
    );
    expect(screen.getByText('Breakpoints (1)')).toBeInTheDocument();
  });
});
