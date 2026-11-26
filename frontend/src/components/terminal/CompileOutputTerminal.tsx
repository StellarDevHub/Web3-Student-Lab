'use client';

import React from 'react';
import {
  CompilerTerminal,
  type CompileLogEntry,
  type CompileLogLevel,
  type CompilerTerminalProps,
} from '@/components/editor/CompilerTerminal';

export type { CompileLogEntry, CompileLogLevel };

export interface CompileOutputTerminalProps extends CompilerTerminalProps {
  logs: CompileLogEntry[];
  isCompiling?: boolean;
}

/**
 * CompileOutputTerminal with accessible ARIA 1.2 Live Regions.
 * Backwards-compatible wrapper delegating to CompilerTerminal (FE-078).
 */
export function CompileOutputTerminal({
  logs,
  isCompiling = false,
  ...props
}: CompileOutputTerminalProps) {
  return (
    <CompilerTerminal
      logs={logs}
      isCompiling={isCompiling}
      title="Compile_Output"
      terminalId="compile-output-terminal"
      {...props}
    />
  );
}

export default CompileOutputTerminal;
