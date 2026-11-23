'use client';

import { useCallback, useState } from 'react';
import { API_BASE_URL } from '@/lib/api-config';

export interface DependencyInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  updateType: 'major' | 'minor' | 'patch' | 'none';
  releaseNotes?: string;
}

export interface DependencyCheckResult {
  dependencies: DependencyInfo[];
  outdatedCount: number;
  checkedAt: string;
  cargoTomlHash: string;
}

export interface DependencyUpdateResult {
  updated: string[];
  failed: string[];
  suggestedCargoToml: string;
}

interface UseDependencyUpdatesReturn {
  checkResult: DependencyCheckResult | null;
  updateResult: DependencyUpdateResult | null;
  isChecking: boolean;
  isUpdating: boolean;
  error: string | null;
  checkDependencies: (cargoToml: string) => Promise<void>;
  applyUpdates: (cargoToml: string, dependencies: string[]) => Promise<void>;
  reset: () => void;
}

export function useDependencyUpdates(): UseDependencyUpdatesReturn {
  const [checkResult, setCheckResult] = useState<DependencyCheckResult | null>(null);
  const [updateResult, setUpdateResult] = useState<DependencyUpdateResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkDependencies = useCallback(async (cargoToml: string) => {
    setIsChecking(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/dependencies/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cargoToml }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        throw new Error(data.message ?? 'Failed to check dependencies');
      }
      setCheckResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsChecking(false);
    }
  }, []);

  const applyUpdates = useCallback(async (cargoToml: string, dependencies: string[]) => {
    setIsUpdating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/dependencies/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cargoToml, dependencies }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        throw new Error(data.message ?? 'Failed to update dependencies');
      }
      setUpdateResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const reset = useCallback(() => {
    setCheckResult(null);
    setUpdateResult(null);
    setError(null);
  }, []);

  return { checkResult, updateResult, isChecking, isUpdating, error, checkDependencies, applyUpdates, reset };
}
