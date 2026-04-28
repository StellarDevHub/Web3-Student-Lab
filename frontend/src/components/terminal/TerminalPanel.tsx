"use client";

import React, { useState } from "react";
import { Terminal } from "@/components/terminal/Terminal";

export function TerminalPanel() {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Integrated CLI</h3>
        <button
          onClick={() => setOpen((value) => !value)}
          className="rounded border border-white/20 px-2 py-1 text-[9px] font-bold uppercase text-zinc-200 hover:bg-white/10"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open ? <Terminal className="h-72" /> : <div className="text-xs text-zinc-500">Terminal hidden</div>}
    </div>
  );
}
