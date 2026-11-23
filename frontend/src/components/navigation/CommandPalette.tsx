'use client';

import React, { useCallback, useEffect, useId, useRef } from 'react';
import {
  ArrowRight,
  BookOpen,
  Cpu,
  FileCode,
  Fingerprint,
  FlaskConical,
  Search,
  Terminal,
  Wallet,
} from 'lucide-react';
import {
  CommandCategory,
  CommandItem,
  RouteDef,
  NAV_ROUTES,
  CONTRACT_NAMES,
  placeholderAddress,
  titleize,
  buildCommandIndex,
  filterCommands,
} from '@/constants/searchIndex';
import { useCommandPalette } from '@/hooks/useCommandPalette';

export type { CommandCategory, CommandItem, RouteDef };
export { NAV_ROUTES, CONTRACT_NAMES, placeholderAddress, titleize, buildCommandIndex, filterCommands };

export const CATEGORY_META: Record<CommandCategory, { label: string; Icon: typeof BookOpen }> = {
  courses: { label: 'Courses', Icon: BookOpen },
  contracts: { label: 'Contracts', Icon: FileCode },
  simulators: { label: 'Simulators', Icon: FlaskConical },
  tools: { label: 'Tools', Icon: Cpu },
  addresses: { label: 'Deployed Addresses', Icon: Wallet },
  docs: { label: 'Docs', Icon: Terminal },
  templates: { label: 'Templates', Icon: FileCode },
  actions: { label: 'Actions', Icon: Fingerprint },
};

export interface CommandPaletteProps {
  items?: CommandItem[];
  placeholder?: string;
  /** Limit visible results (default 50). */
  limit?: number;
  toggleTheme?: () => void;
  connectWallet?: () => void;
}

export function CommandPalette({
  items,
  placeholder,
  limit = 50,
  toggleTheme,
  connectWallet,
}: CommandPaletteProps) {
  const {
    isOpen,
    setIsOpen,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    results,
    recents,
    executeItem,
  } = useCommandPalette({ items, limit, toggleTheme, connectWallet });

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const inputId = useId();

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        results.length === 0 ? 0 : (prev - 1 + results.length) % results.length
      );
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedIndex(Math.max(0, results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[selectedIndex];
      if (item) executeItem(item);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, isOpen]);

  if (!isOpen) return null;

  const activeId = results[selectedIndex]
    ? `command-option-${results[selectedIndex].id}`
    : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      data-testid="command-palette-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-20 bg-black/70 backdrop-blur-md"
      onClick={() => setIsOpen(false)}
      onKeyDown={handleDialogKeyDown}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-red-500/30 bg-zinc-950 text-white shadow-2xl shadow-red-900/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-white/10 px-4 py-3">
          <Search className="h-5 w-5 text-gray-400 mr-3 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={
              placeholder ?? 'Search courses, contracts, simulators, addresses, tools… (Cmd+K)'
            }
            className="w-full bg-transparent text-sm text-white placeholder-gray-500 outline-none font-mono"
            aria-label="Search command palette"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-activedescendant={activeId}
            autoComplete="off"
            spellCheck={false}
            data-testid="command-palette-input"
          />
          <kbd className="hidden sm:inline-block rounded border border-white/20 px-2 py-0.5 text-[10px] font-mono text-gray-400">
            ESC
          </kbd>
        </div>

        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          aria-labelledby={inputId}
          data-testid="command-palette-listbox"
          className="max-h-96 overflow-y-auto p-2"
        >
          {recents.length > 0 && !query && (
            <div className="pb-2 mb-2 border-b border-white/5">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400">
                Recent
              </div>
              {recents.map((item) => (
                <button
                  key={`recent-${item.id}`}
                  type="button"
                  onClick={() => executeItem(item)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/5 transition-colors text-xs text-gray-300"
                >
                  <span className="truncate">{item.title}</span>
                  <ArrowRight className="h-3 w-3 text-gray-500 shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          {results.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No matching commands or topics found.
            </div>
          ) : (
            results.map((item, index) => {
              const meta = CATEGORY_META[item.category];
              const Icon = meta?.Icon ?? Search;
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  id={`command-option-${item.id}`}
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-red-500/20 border border-red-500/30 text-white'
                      : 'border border-transparent text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg ${isSelected ? 'bg-red-500 text-white' : 'bg-white/5 text-gray-400'}`}
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{item.title}</div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {item.description}
                        {item.address ? ` · ${item.address.slice(0, 10)}…` : ''}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded border border-white/10 bg-white/5 text-gray-400 shrink-0 ml-2">
                    {meta?.label ?? item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2 text-[10px] font-mono text-gray-500">
          <span>
            <kbd className="rounded border border-white/10 px-1">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded border border-white/10 px-1">Enter</kbd> open
          </span>
          <span>
            <kbd className="rounded border border-white/10 px-1">Esc</kbd> close
          </span>
          <span className="ml-auto">
            {results.length} result{results.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteTrigger({ className = '' }: { className?: string }) {
  const open = useCallback(() => {
    window.dispatchEvent(new CustomEvent('w3sl:open-command-palette'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  }, []);
  return (
    <button
      type="button"
      aria-label="Open command palette (Cmd+K)"
      onClick={open}
      className={`flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400 hover:bg-white/10 hover:text-white transition-colors ${className}`}
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline font-mono">Search…</span>
      <kbd className="hidden sm:inline-block rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-mono">
        ⌘K
      </kbd>
    </button>
  );
}

export default CommandPalette;
