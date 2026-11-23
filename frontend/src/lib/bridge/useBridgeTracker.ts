'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bridgeStatusService,
  getDefaultPollIntervalMs,
  parseBridgeEndpointConfig,
} from './bridgeService';
import { getDevelopmentBridgeTransactions } from './devFixtures';
import type { BridgeEndpointConfig, BridgeStatusService, BridgeTransaction } from './types';

interface UseBridgeTrackerOptions {
  endpoints?: BridgeEndpointConfig[];
  service?: BridgeStatusService;
  autoRefresh: boolean;
}

interface UseBridgeTrackerResult {
  transactions: BridgeTransaction[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  configured: boolean;
  usingLocalFixtures: boolean;
  refresh: () => Promise<void>;
}

export function useBridgeTracker({
  endpoints,
  service = bridgeStatusService,
  autoRefresh,
}: UseBridgeTrackerOptions): UseBridgeTrackerResult {
  const configuredEndpoints = useMemo(
    () => endpoints ?? parseBridgeEndpointConfig(),
    [endpoints]
  );
  const [transactions, setTransactions] = useState<BridgeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const configured = configuredEndpoints.length > 0;
  const usingLocalFixtures = !configured && process.env.NODE_ENV !== 'production';

  const refresh = useCallback(async () => {
    if (activeRequest.current) return;

    if (!configured) {
      setTransactions(usingLocalFixtures ? getDevelopmentBridgeTransactions() : []);
      setError(
        usingLocalFixtures
          ? null
          : 'No bridge endpoints are configured. Set NEXT_PUBLIC_BRIDGE_ENDPOINTS to enable live tracking.'
      );
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setRefreshing(true);
    setError(null);

    try {
      const liveTransactions = await service.listTransactions(configuredEndpoints, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setTransactions(liveTransactions);
    } catch (caught) {
      if (!mounted.current || controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Bridge service is unavailable.');
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
      }
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [configured, configuredEndpoints, service, usingLocalFixtures]);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh || !configured) return;

    const interval = window.setInterval(() => {
      void refresh();
    }, getDefaultPollIntervalMs(configuredEndpoints));

    return () => window.clearInterval(interval);
  }, [autoRefresh, configured, configuredEndpoints, refresh]);

  return {
    transactions,
    loading,
    refreshing,
    error,
    configured,
    usingLocalFixtures,
    refresh,
  };
}
