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

export function useLayoutPersistence(userId?: string) {
  const [layout, setLayout] = useState<WorkspaceLayout>(DEFAULT_LAYOUT);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(getStorageKey(userId));
      if (stored) {
        setLayout(JSON.parse(stored));
      } else {
        setLayout(DEFAULT_LAYOUT);
      }
    } catch {
      setLayout(DEFAULT_LAYOUT);
    }
  }, [userId]);

  const saveLayout = useCallback(
    (newLayout: WorkspaceLayout) => {
      setLayout(newLayout);
      try {
        localStorage.setItem(getStorageKey(userId), JSON.stringify(newLayout));
      } catch {
        // storage unavailable
      }
    },
    [userId]
  );

  const resetLayout = useCallback(() => {
    saveLayout(DEFAULT_LAYOUT);
  }, [saveLayout]);

  return { layout, saveLayout, resetLayout };
}
