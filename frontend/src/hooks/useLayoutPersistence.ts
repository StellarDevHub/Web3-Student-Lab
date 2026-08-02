import { getItem, setItem } from '@/lib/localStorage';
import { useCallback, useEffect, useState } from 'react';

export interface PanelLayout {
  id: string;
  order: number;
  colSpan: number; // 1-3 columns
}

export interface WorkspaceLayout {
  panels: PanelLayout[];
}

const DEFAULT_LAYOUT: WorkspaceLayout = {
  panels: [
    { id: 'stats', order: 0, colSpan: 3 },
    { id: 'courses', order: 1, colSpan: 2 },
    { id: 'certificates', order: 2, colSpan: 1 },
    { id: 'audit', order: 3, colSpan: 3 },
  ],
};

function getStorageKey(userId?: string) {
  return `workspace_layout_${userId ?? 'guest'}`;
}

/**
 * Hook for persisting workspace layout to localStorage
 * Now uses the centralized localStorage utility for better error handling
 *
 * @param userId - Optional user ID for user-specific layouts
 * @returns Layout state and helper functions
 */
export function useLayoutPersistence(userId?: string) {
  const [layout, setLayout] = useState<WorkspaceLayout>(DEFAULT_LAYOUT);

  useEffect(() => {
    const stored = getItem<WorkspaceLayout>(getStorageKey(userId), DEFAULT_LAYOUT);
    setLayout(stored);
  }, [userId]);

  const saveLayout = useCallback(
    (newLayout: WorkspaceLayout) => {
      setLayout(newLayout);
      setItem(getStorageKey(userId), newLayout);
    },
    [userId]
  );

  const resetLayout = useCallback(() => {
    saveLayout(DEFAULT_LAYOUT);
  }, [saveLayout]);

  return { layout, saveLayout, resetLayout };
}
