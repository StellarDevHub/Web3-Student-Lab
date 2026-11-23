'use client';

import React, { useMemo, useState, useRef } from 'react';
import { CommandParser } from '@/lib/terminal/CommandParser';
import { MockFileSystem } from '@/lib/terminal/MockFileSystem';

interface TerminalProps {
  className?: string;
}

export function Terminal({ className }: TerminalProps) {
  const fs = useMemo(() => new MockFileSystem(), []);
  const parser = useMemo(() => new CommandParser(fs), [fs]);
  const [history, setHistory] = useState<string[]>([
    'Stellar Terminal Simulator (mock)',
    'Type `help` to list commands.',
  ]);
  const [input, setInput] = useState('');
  const [cursor, setCursor] = useState<number>(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const runCommand = (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    const prompt = `${fs.pwd()} $ ${command}`;
    const output = parser.execute(command);
    setHistory((prev) => [...prev, prompt, ...(output ? [output] : [])]);
    setCommandHistory((prev) => [...prev, command]);
    setCursor(-1);
    setInput('');

    if (command === 'clear') {
      setHistory([]);
      setAnnouncement('Terminal cleared');
    } else {
      setAnnouncement(`Command executed: ${command}. Result: ${output || 'Done'}`);
    }
  };

  return (
    <div
      role="region"
      aria-label="Interactive Terminal Simulator"
      className={`flex h-full flex-col rounded-xl border border-white/10 bg-black ${className ?? ''}`}
    >
      {/* Live Region for Screen Reader Announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[10px] font-black tracking-[0.2em] text-zinc-500 uppercase">
        <span>terminal</span>
        <span className="text-[9px] text-zinc-600 font-mono">Press Ctrl+L to clear</span>
      </div>

      {/* Terminal Output Log */}
      <div
        role="log"
        aria-live="polite"
        aria-atomic="false"
        tabIndex={0}
        aria-label="Terminal output log"
        className="flex-1 overflow-auto p-3 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-red-500/30"
      >
        {history.map((line, index) => (
          <div key={`${line}-${index}`} className="leading-5 whitespace-pre-wrap">
            {line}
          </div>
        ))}
      </div>

      {/* Command Input Area */}
      <div className="border-t border-white/10 p-2">
        <label htmlFor="terminal-command-input" className="sr-only">
          Terminal command line input
        </label>
        <span id="terminal-instructions" className="sr-only">
          Type help for available commands. Press Enter to execute. Use Up and Down arrow keys to
          cycle history. Press Control L to clear.
        </span>
        <input
          id="terminal-command-input"
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          aria-label="Terminal command line input"
          aria-describedby="terminal-instructions"
          onKeyDown={(event) => {
            // Ctrl+L / Cmd+L: Clear terminal
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
              event.preventDefault();
              setHistory([]);
              setAnnouncement('Terminal cleared');
              return;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setInput('');
              return;
            }

            if (event.key === 'Enter') {
              runCommand(input);
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              const next = cursor === -1 ? commandHistory.length - 1 : Math.max(0, cursor - 1);
              setCursor(next);
              setInput(commandHistory[next] ?? '');
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (cursor === -1) return;
              const next = Math.min(commandHistory.length - 1, cursor + 1);
              setCursor(next);
              setInput(commandHistory[next] ?? '');
            }
            if (event.key === 'Tab') {
              event.preventDefault();
              if ('stellar'.startsWith(input)) setInput('stellar ');
              if ('help'.startsWith(input)) setInput('help');
            }
          }}
          className="w-full rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-xs text-white outline-none focus:border-red-400/70"
          placeholder={`${fs.pwd()} $`}
        />
      </div>
    </div>
  );
}
