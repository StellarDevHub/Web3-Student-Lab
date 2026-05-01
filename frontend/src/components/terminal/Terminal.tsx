"use client";

import React, { useMemo, useState } from "react";
import { CommandParser } from "@/lib/terminal/CommandParser";
import { MockFileSystem } from "@/lib/terminal/MockFileSystem";

interface TerminalProps {
  className?: string;
}

export function Terminal({ className }: TerminalProps) {
  const fs = useMemo(() => new MockFileSystem(), []);
  const parser = useMemo(() => new CommandParser(fs), [fs]);
  const [history, setHistory] = useState<string[]>([
    "Stellar Terminal Simulator (mock)",
    "Type `help` to list commands.",
  ]);
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState<number>(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  const runCommand = (command: string) => {
    const prompt = `${fs.pwd()} $ ${command}`;
    const output = parser.execute(command);
    setHistory((prev) => [...prev, prompt, ...(output ? [output] : [])]);
    setCommandHistory((prev) => [...prev, command]);
    setCursor(-1);
    setInput("");
    if (command === "clear") {
      setHistory([]);
    }
  };

  return (
    <div className={`flex h-full flex-col rounded-xl border border-white/10 bg-black ${className ?? ""}`}>
      <div className="border-b border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
        terminal
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs text-zinc-200">
        {history.map((line, index) => (
          <div key={`${line}-${index}`} className="whitespace-pre-wrap leading-5">
            {line}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              runCommand(input);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              const next = cursor === -1 ? commandHistory.length - 1 : Math.max(0, cursor - 1);
              setCursor(next);
              setInput(commandHistory[next] ?? "");
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (cursor === -1) return;
              const next = Math.min(commandHistory.length - 1, cursor + 1);
              setCursor(next);
              setInput(commandHistory[next] ?? "");
            }
            if (event.key === "Tab") {
              event.preventDefault();
              if ("stellar".startsWith(input)) setInput("stellar ");
              if ("help".startsWith(input)) setInput("help");
            }
          }}
          className="w-full rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-xs text-white outline-none focus:border-red-400/70"
          placeholder={`${fs.pwd()} $`}
        />
      </div>
    </div>
  );
}
