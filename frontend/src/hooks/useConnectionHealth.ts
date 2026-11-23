'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  checkConnectionHealthMatrix,
  getPublicEnv,
  type ConnectionHealthMatrix,
  type EnvFallbackMatrix,
  type HealthStatus,
} from '@/lib/env';

export interface UseConnectionHealthReturn {
  matrix: ConnectionHealthMatrix;
  fallbacks: EnvFallbackMatrix;
  isChecking: boolean;
  overallStatus: HealthStatus;
  hasDegradedOrOffline: boolean;
  refresh: () => Promise<void>;
  lastChecked: number | null;
}

function getInitialMatrix(): ConnectionHealthMatrix {
  let env;
  try {
    env = getPublicEnv();
  } catch {
    // If during early boot or dev exception
    env = null;
  }

  const fallbacks: EnvFallbackMatrix = env?.fallbacks ?? {
    apiUrl: false,
    wsUrl: false,
    sorobanRpcUrl: false,
    horizonUrl: false,
    certificateContractId: false,
    hasAnyFallback: false,
    details: {
      api: { isFallback: false, service: 'api', url: '', defaultUrl: '', envVarName: 'NEXT_PUBLIC_API_URL' },
      ws: { isFallback: false, service: 'ws', url: '', defaultUrl: '', envVarName: 'NEXT_PUBLIC_WS_URL' },
      sorobanRpc: { isFallback: false, service: 'sorobanRpc', url: '', defaultUrl: '', envVarName: 'NEXT_PUBLIC_SOROBAN_RPC_URL' },
      horizon: { isFallback: false, service: 'horizon', url: '', defaultUrl: '', envVarName: 'NEXT_PUBLIC_HORIZON_URL' },
    },
  };

  return {
    api: {
      service: 'api',
      label: 'Backend API',
      status: 'checking',
      url: env?.apiUrl || '',
      isFallback: fallbacks.apiUrl,
      lastChecked: 0,
    },
    ws: {
      service: 'ws',
      label: 'WebSocket Gateway',
      status: 'checking',
      url: env?.wsUrl || '',
      isFallback: fallbacks.wsUrl,
      lastChecked: 0,
    },
    sorobanRpc: {
      service: 'sorobanRpc',
      label: 'Soroban RPC',
      status: 'checking',
      url: env?.sorobanRpcUrl || '',
      isFallback: fallbacks.sorobanRpcUrl,
      lastChecked: 0,
    },
    horizon: {
      service: 'horizon',
      label: 'Stellar Horizon',
      status: 'checking',
      url: env?.horizonUrl || '',
      isFallback: fallbacks.horizonUrl,
      lastChecked: 0,
    },
    overallStatus: 'checking',
    timestamp: Date.now(),
  };
}

/**
 * React hook to observe runtime connection health and fallback detection matrix.
 * Probes all services concurrently and computes live latencies and operational status.
 */
export function useConnectionHealth(pollIntervalMs: number = 0): UseConnectionHealthReturn {
  const [matrix, setMatrix] = useState<ConnectionHealthMatrix>(getInitialMatrix);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const refresh = useCallback(async () => {
    setIsChecking(true);
    try {
      const result = await checkConnectionHealthMatrix();
      if (isMountedRef.current) {
        setMatrix(result);
        setLastChecked(Date.now());
      }
    } catch {
      // If error occurs, keep last matrix with offline status
    } finally {
      if (isMountedRef.current) {
        setIsChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    refresh();

    if (pollIntervalMs > 0) {
      const timer = setInterval(refresh, pollIntervalMs);
      return () => {
        isMountedRef.current = false;
        clearInterval(timer);
      };
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [refresh, pollIntervalMs]);

  let envFallbacks: EnvFallbackMatrix;
  try {
    envFallbacks = getPublicEnv().fallbacks;
  } catch {
    envFallbacks = matrix.api ? {
      apiUrl: matrix.api.isFallback,
      wsUrl: matrix.ws.isFallback,
      sorobanRpcUrl: matrix.sorobanRpc.isFallback,
      horizonUrl: matrix.horizon.isFallback,
      certificateContractId: false,
      hasAnyFallback: matrix.api.isFallback || matrix.ws.isFallback,
      details: {
        api: { isFallback: matrix.api.isFallback, service: 'api', url: matrix.api.url, defaultUrl: '', envVarName: 'NEXT_PUBLIC_API_URL' },
        ws: { isFallback: matrix.ws.isFallback, service: 'ws', url: matrix.ws.url, defaultUrl: '', envVarName: 'NEXT_PUBLIC_WS_URL' },
        sorobanRpc: { isFallback: matrix.sorobanRpc.isFallback, service: 'sorobanRpc', url: matrix.sorobanRpc.url, defaultUrl: '', envVarName: 'NEXT_PUBLIC_SOROBAN_RPC_URL' },
        horizon: { isFallback: matrix.horizon.isFallback, service: 'horizon', url: matrix.horizon.url, defaultUrl: '', envVarName: 'NEXT_PUBLIC_HORIZON_URL' },
      },
    } : {
      apiUrl: false,
      wsUrl: false,
      sorobanRpcUrl: false,
      horizonUrl: false,
      certificateContractId: false,
      hasAnyFallback: false,
      details: {} as any,
    };
  }

  const hasDegradedOrOffline =
    matrix.overallStatus === 'degraded' || matrix.overallStatus === 'offline';

  return {
    matrix,
    fallbacks: envFallbacks,
    isChecking,
    overallStatus: matrix.overallStatus,
    hasDegradedOrOffline,
    refresh,
    lastChecked,
  };
}
