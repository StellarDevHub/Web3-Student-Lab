import { useState, useEffect, useMemo, useCallback } from 'react';
import Fuse from 'fuse.js';
import { useRouter } from 'next/navigation';
import {
  CommandItem,
  buildCommandIndex,
  filterCommands,
} from '@/constants/searchIndex';

export const RECENTS_KEY = 'w3sl.command-palette.recents';

export function loadRecents(all: CommandItem[]): CommandItem[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(RECENTS_KEY) : null;
    if (!raw) return [];
    const ids = JSON.parse(raw) as string[];
    if (!Array.isArray(ids)) return [];
    const byId = new Map(all.map((i) => [i.id, i]));
    return ids
      .map((id) => byId.get(id))
      .filter((i): i is CommandItem => Boolean(i))
      .slice(0, 5);
  } catch {
    return [];
  }
}

export interface UseCommandPaletteOptions {
  items?: CommandItem[];
  limit?: number;
  onExecute?: (item: CommandItem) => void;
  toggleTheme?: () => void;
  connectWallet?: () => void;
}

export function useCommandPalette(options: UseCommandPaletteOptions = {}) {
  const { items, limit = 50, onExecute, toggleTheme, connectWallet } = options;
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recents, setRecents] = useState<CommandItem[]>([]);

  const allItems = useMemo(
    () => items ?? buildCommandIndex({ toggleTheme, connectWallet }),
    [items, toggleTheme, connectWallet]
  );

  const fuse = useMemo(
    () =>
      new Fuse(allItems, {
        keys: [
          { name: 'title', weight: 0.45 },
          { name: 'description', weight: 0.2 },
          { name: 'keywords', weight: 0.25 },
          { name: 'category', weight: 0.05 },
          { name: 'address', weight: 0.05 },
        ],
        threshold: 0.35,
        distance: 100,
        includeScore: true,
        ignoreLocation: true,
      }),
    [allItems]
  );

  const results = useMemo<CommandItem[]>(() => {
    if (!query.trim()) return allItems.slice(0, 30);
    try {
      const hits = fuse.search(query, { limit }).map((r) => r.item);
      if (hits.length > 0) return hits;
    } catch {
      // Fallback to subsequence filter
    }
    return filterCommands(allItems, query, limit);
  }, [query, fuse, allItems, limit]);

  useEffect(() => {
    setSelectedIndex((prev) => (results.length === 0 ? 0 : Math.min(prev, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const onOpenEvent = () => setIsOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('w3sl:open-command-palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('w3sl:open-command-palette', onOpenEvent);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setRecents(loadRecents(allItems));
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen, allItems]);

  const executeItem = useCallback(
    (item: CommandItem) => {
      setRecents((prev) => {
        const next = [item, ...prev.filter((i) => i.id !== item.id)].slice(0, 5);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem(RECENTS_KEY, JSON.stringify(next.map((i) => i.id)));
          }
        } catch {
          // noop
        }
        return next;
      });

      setIsOpen(false);

      if (onExecute) {
        onExecute(item);
      }

      if (item.action) {
        item.action();
        return;
      }

      if (item.href) {
        try {
          router.push(item.href);
        } catch {
          window.location.href = item.href;
        }
      }
    },
    [router, onExecute]
  );

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    setIsOpen,
    open,
    close,
    toggle,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    results,
    recents,
    executeItem,
    allItems,
  };
}

export default useCommandPalette;
