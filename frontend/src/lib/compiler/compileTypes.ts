export type CompileLogLevel = 'info' | 'success' | 'error';

export interface CompileLogEntry {
  id: string;
  level: CompileLogLevel;
  message: string;
  timestamp: string;
}

export interface CompileWorkerCompileRequest {
  type: 'compile';
  source: string;
  filePath: string;
}

export interface CompileWorkerLogMessage {
  type: 'log';
  entry: CompileLogEntry;
}

export interface CompileWorkerCompleteMessage {
  type: 'complete';
  success: boolean;
  warnings: string[];
  errors: string[];
  exports: string[];
  wasmSizeKb: number;
  durationMs: number;
}

export type CompileWorkerResponse = CompileWorkerLogMessage | CompileWorkerCompleteMessage;
export type CompileWorkerRequest = CompileWorkerCompileRequest;
