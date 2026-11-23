'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface SharedState {
  selectedLab: string;
  setSelectedLab: (value: string) => void;
}

const SharedStateContext = createContext<SharedState | null>(null);

export function SharedStateProvider({ children }: { children: ReactNode }) {
  const [selectedLab, setSelectedLab] = useState('WebRTC Lab');
  const value = useMemo(() => ({ selectedLab, setSelectedLab }), [selectedLab]);

  return <SharedStateContext.Provider value={value}>{children}</SharedStateContext.Provider>;
}

export function useSharedState() {
  const context = useContext(SharedStateContext);
  if (!context) {
    throw new Error('useSharedState must be used inside SharedStateProvider');
  }
  return context;
}

export function SharedLibraryCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
      <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
      <p className="mt-2 text-slate-400">{description}</p>
    </div>
  );
}
