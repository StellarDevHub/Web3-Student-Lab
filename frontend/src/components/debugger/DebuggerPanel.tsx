'use client';

import { useState, useRef } from 'react';
import { useDebugger } from '@/hooks/useDebugger';
import CallStackView from './CallStackView';
import StateInspector from './StateInspector';
import BreakpointManager from './BreakpointManager';

// ---------------------------------------------------------------------------
// Step type styling
// ---------------------------------------------------------------------------

const STEP_COLORS: Record<string, { dot: string; bg: string; label: string }> = {
  function_call: { dot: 'bg-[#00d4aa]', bg: 'bg-[#00d4aa]/5  border-[#00d4aa]/20', label: 'CALL' },
  function_return: {
    dot: 'bg-[#c9b1ff]',
    bg: 'bg-[#c9b1ff]/5  border-[#c9b1ff]/20',
    label: 'RETURN',
  },
  storage_read: { dot: 'bg-[#a8d8ea]', bg: 'bg-[#a8d8ea]/5  border-[#a8d8ea]/20', label: 'READ' },
  storage_write: { dot: 'bg-[#f9c74f]', bg: 'bg-[#f9c74f]/5  border-[#f9c74f]/20', label: 'WRITE' },
  variable_mutation: {
    dot: 'bg-[#f77f00]',
    bg: 'bg-[#f77f00]/5  border-[#f77f00]/20',
    label: 'MUTATE',
  },
  error: { dot: 'bg-[#f94144]', bg: 'bg-[#f94144]/5  border-[#f94144]/20', label: 'ERROR' },
  gas_checkpoint: { dot: 'bg-[#3a8a6a]', bg: 'bg-[#3a8a6a]/5  border-[#3a8a6a]/20', label: 'GAS' },
};

type Panel = 'stack' | 'state' | 'breakpoints';

// ---------------------------------------------------------------------------
// Execution controls bar
// ---------------------------------------------------------------------------

function ExecutionControls({
  isRunning,
  isPaused,
  currentStep,
  totalSteps,
  onStart,
  onPlay,
  onPause,
  onStop,
  onStepForward,
  onStepBackward,
  onExport,
}: {
  isRunning: boolean;
  isPaused: boolean;
  currentStep: number;
  totalSteps: number;
  onStart: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onExport: () => void;
}) {
  const progress = totalSteps > 0 ? (currentStep / (totalSteps - 1)) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Button row */}
      <div className="flex flex-wrap items-center gap-2">
        {!isRunning ? (
          <button
            onClick={onStart}
            className="flex items-center gap-2 rounded-lg bg-[#00d4aa] px-4 py-2 text-xs font-bold text-[#061015] shadow-[0_0_16px_rgba(0,212,170,0.3)] transition-colors hover:bg-[#00b894]"
          >
            <span>▶</span> Start Debugger
          </button>
        ) : (
          <>
            <button
              onClick={onStepBackward}
              disabled={currentStep === 0}
              title="Step Back"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1a2e3a] bg-[#0d1b2a] text-sm text-[#7ecfb3] transition-colors hover:border-[#00d4aa]/40 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ⏮
            </button>

            {isPaused ? (
              <button
                onClick={onPlay}
                title="Play"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#00d4aa]/40 bg-[#00d4aa]/10 text-[#00d4aa] transition-colors hover:bg-[#00d4aa]/20"
              >
                ▶
              </button>
            ) : (
              <button
                onClick={onPause}
                title="Pause"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f9c74f]/40 bg-[#f9c74f]/10 text-[#f9c74f] transition-colors hover:bg-[#f9c74f]/20"
              >
                ⏸
              </button>
            )}

            <button
              onClick={onStepForward}
              disabled={currentStep >= totalSteps - 1}
              title="Step Forward"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1a2e3a] bg-[#0d1b2a] text-sm text-[#7ecfb3] transition-colors hover:border-[#00d4aa]/40 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ⏭
            </button>

            <button
              onClick={onStop}
              title="Stop"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f94144]/30 bg-[#f94144]/5 text-sm text-[#f94144] transition-colors hover:bg-[#f94144]/15"
            >
              ■
            </button>

            <div className="mx-1 h-5 w-px bg-[#1a2e3a]" />

            <button
              onClick={onExport}
              className="flex items-center gap-1.5 rounded-lg border border-[#1a2e3a] px-3 py-1.5 text-xs text-[#4a6070] transition-colors hover:border-[#2a3e4a] hover:text-[#7ecfb3]"
            >
              ↓ Export Trace
            </button>
          </>
        )}
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#0d1b2a]">
            <div
              className="h-full rounded-full bg-[#00d4aa] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-[10px] whitespace-nowrap text-[#4a6070]">
            {currentStep + 1} / {totalSteps}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline / execution history strip
// ---------------------------------------------------------------------------

function ExecutionTimeline({
  steps,
  currentStep,
  onJump,
}: {
  steps: { id: number; type: string; description: string; gasConsumed: number }[];
  currentStep: number;
  onJump: (i: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (steps.length === 0) return null;

  return (
    <div className="border-t border-[#1a2e3a]">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="font-mono text-[10px] tracking-widest text-[#4a6070] uppercase">
          Execution Timeline
        </span>
        <span className="font-mono text-[10px] text-[#3a5570]">
          ⛽ {steps[currentStep]?.gasConsumed?.toLocaleString() ?? 0} gas
        </span>
      </div>
      <div
        ref={containerRef}
        className="scrollbar-none flex gap-0.5 overflow-x-auto px-4 pb-3"
        style={{ scrollbarWidth: 'none' }}
      >
        {steps.map((step, i) => {
          const style = STEP_COLORS[step.type] ?? STEP_COLORS.function_call;
          const isCurrent = i === currentStep;
          return (
            <button
              key={step.id}
              onClick={() => onJump(i)}
              title={step.description}
              className={[
                'h-6 w-3 flex-shrink-0 rounded-sm transition-all duration-150',
                isCurrent
                  ? `${style.dot.replace('bg-', 'bg-')} scale-y-125 opacity-100 shadow-lg`
                  : i < currentStep
                    ? `${style.dot} opacity-60`
                    : 'bg-[#1a2e3a] opacity-40',
              ].join(' ')}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code editor with line numbers & breakpoint gutter
// ---------------------------------------------------------------------------

function CodeEditor({
  code,
  onChange,
  breakpoints,
  currentLine,
  onToggleBreakpoint,
  readOnly,
}: {
  code: string;
  onChange: (c: string) => void;
  breakpoints: Set<number>;
  currentLine?: number;
  onToggleBreakpoint: (line: number) => void;
  readOnly: boolean;
}) {
  const lines = code.split('\n');

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-[#1a2e3a] font-mono text-xs">
      {/* Gutter */}
      <div className="flex flex-shrink-0 flex-col border-r border-[#1a2e3a] bg-[#080f14] select-none">
        {lines.map((_, i) => {
          const lineNum = i + 1;
          const hasBp = breakpoints.has(lineNum);
          const isCurrent = lineNum === currentLine;
          return (
            <div
              key={i}
              onClick={() => onToggleBreakpoint(lineNum)}
              className={[
                'group flex h-5 cursor-pointer items-center gap-1.5 px-2 transition-colors',
                isCurrent ? 'bg-[#f9c74f]/10' : 'hover:bg-[#1a2e3a]/50',
              ].join(' ')}
            >
              <span
                className={[
                  'h-2 w-2 flex-shrink-0 rounded-full transition-all',
                  hasBp
                    ? 'bg-[#f94144]'
                    : isCurrent
                      ? 'bg-[#f9c74f]'
                      : 'bg-transparent group-hover:bg-[#f94144]/30',
                ].join(' ')}
              />
              <span
                className={[
                  'w-5 text-right text-[10px]',
                  isCurrent ? 'text-[#f9c74f]' : 'text-[#2a4a5a]',
                ].join(' ')}
              >
                {lineNum}
              </span>
            </div>
          );
        })}
      </div>

      {/* Code area */}
      <textarea
        value={code}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        className="flex-1 resize-none overflow-auto bg-[#080f14] p-2 leading-5 text-[#a0c4b8] focus:outline-none"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DebuggerPanel
// ---------------------------------------------------------------------------

export default function DebuggerPanel() {
  const [activePanel, setActivePanel] = useState<Panel>('state');

  const {
    contractCode,
    setContractCode,
    state,
    startDebugging,
    stepForward,
    stepBackward,
    play,
    pause,
    stop,
    jumpToStep,
    toggleBreakpoint,
    clearBreakpoints,
    addWatchExpression,
    removeWatchExpression,
    exportTrace,
  } = useDebugger();

  const currentStepData = state.executionHistory[state.currentStep];
  const currentLine = currentStepData?.line;

  const panels: { id: Panel; label: string; icon: string }[] = [
    { id: 'stack', label: 'Call Stack', icon: '⬡' },
    { id: 'state', label: 'State', icon: '◈' },
    { id: 'breakpoints', label: 'Breakpoints', icon: '⬤' },
  ];

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-[#061015] text-[#a0c4b8]"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#1a2e3a] bg-[#080f14] px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#00d4aa]/30 bg-[#00d4aa]/10">
            <span className="text-xs text-[#00d4aa]">⬡</span>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[#c8e6de]">Soroban Debugger</h1>
            <p className="text-[10px] text-[#3a5570]">Step-through contract execution</p>
          </div>
        </div>

        {state.isRunning && currentStepData && (
          <div
            className={[
              'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs',
              STEP_COLORS[currentStepData.type]?.bg ?? 'border-[#1a2e3a]',
            ].join(' ')}
          >
            <span
              className={[
                'h-1.5 w-1.5 rounded-full',
                STEP_COLORS[currentStepData.type]?.dot ?? 'bg-[#00d4aa]',
                !state.isPaused && 'animate-pulse',
              ].join(' ')}
            />
            <span className="text-[10px] tracking-wider uppercase opacity-70">
              {STEP_COLORS[currentStepData.type]?.label}
            </span>
            <span className="max-w-[200px] truncate text-[#7ecfb3]">
              {currentStepData.description}
            </span>
          </div>
        )}
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-[#1a2e3a] bg-[#080f14]/60 px-5 py-3">
        <ExecutionControls
          isRunning={state.isRunning}
          isPaused={state.isPaused}
          currentStep={state.currentStep}
          totalSteps={state.totalSteps}
          onStart={startDebugging}
          onPlay={play}
          onPause={pause}
          onStop={stop}
          onStepForward={stepForward}
          onStepBackward={stepBackward}
          onExport={exportTrace}
        />
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Code editor pane */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-[#1a2e3a]">
          <div className="flex-shrink-0 px-4 pt-3 pb-2">
            <span className="text-[10px] tracking-widest text-[#4a6070] uppercase">
              Contract Source
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
            <CodeEditor
              code={contractCode}
              onChange={setContractCode}
              breakpoints={state.breakpoints}
              currentLine={currentLine}
              onToggleBreakpoint={toggleBreakpoint}
              readOnly={state.isRunning}
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="flex w-80 flex-shrink-0 flex-col bg-[#080f14]/40">
          {/* Panel tabs */}
          <div className="flex flex-shrink-0 border-b border-[#1a2e3a]">
            {panels.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePanel(p.id)}
                className={[
                  '-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-[10px] tracking-wider uppercase transition-colors',
                  activePanel === p.id
                    ? 'border-[#00d4aa] text-[#00d4aa]'
                    : 'border-transparent text-[#4a6070] hover:text-[#7ecfb3]',
                ].join(' ')}
              >
                <span>{p.icon}</span>
                <span className="hidden sm:inline">{p.label}</span>
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="min-h-0 flex-1 overflow-hidden p-4">
            {activePanel === 'stack' && (
              <CallStackView frames={state.callStack} currentStep={state.currentStep} />
            )}
            {activePanel === 'state' && (
              <StateInspector
                localVariables={state.localVariables}
                contractStorage={state.contractStorage}
                watchExpressions={state.watchExpressions}
                onAddWatch={addWatchExpression}
                onRemoveWatch={removeWatchExpression}
              />
            )}
            {activePanel === 'breakpoints' && (
              <BreakpointManager
                breakpoints={state.breakpoints}
                totalLines={contractCode.split('\n').length}
                onToggle={toggleBreakpoint}
                onClearAll={clearBreakpoints}
                currentLine={currentLine}
              />
            )}
          </div>

          {/* Step detail card */}
          {state.isRunning && currentStepData && (
            <div className="flex-shrink-0 space-y-2 border-t border-[#1a2e3a] p-4">
              <p className="text-[10px] tracking-widest text-[#4a6070] uppercase">Current Step</p>
              <p className="text-xs leading-relaxed text-[#7ecfb3]">
                {currentStepData.description}
              </p>
              {currentStepData.stateDiff && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-[#f94144]/15 bg-[#f94144]/5 p-2">
                    <p className="mb-1 text-[9px] text-[#f94144]/60">BEFORE</p>
                    <p className="font-mono text-[10px] text-[#f94144]">
                      {JSON.stringify(currentStepData.stateDiff.before.value)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#00d4aa]/15 bg-[#00d4aa]/5 p-2">
                    <p className="mb-1 text-[9px] text-[#00d4aa]/60">AFTER</p>
                    <p className="font-mono text-[10px] text-[#00d4aa]">
                      {JSON.stringify(currentStepData.stateDiff.after.value)}
                    </p>
                  </div>
                </div>
              )}
              {currentStepData.line && (
                <p className="text-[10px] text-[#3a5570]">
                  Line {currentStepData.line} · ⛽ {currentStepData.gasConsumed.toLocaleString()}{' '}
                  gas total
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      {state.isRunning && (
        <div className="flex-shrink-0">
          <ExecutionTimeline
            steps={state.executionHistory}
            currentStep={state.currentStep}
            onJump={jumpToStep}
          />
        </div>
      )}
    </div>
  );
}
