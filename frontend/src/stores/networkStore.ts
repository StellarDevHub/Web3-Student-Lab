import { create } from 'zustand';
import { devtools, logger } from './middleware';

export interface NetworkState {
  isConnected: boolean;
  networkType: 'mainnet' | 'testnet' | 'local';
  latency: number | null;
  lastBlockHeight: number | null;
  peers: number;
  bandwidth: {
    upload: number;
    download: number;
  };
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  error: string | null;
}

export interface NetworkActions {
  setConnectionStatus: (status: NetworkState['connectionStatus']) => void;
  setNetworkType: (type: NetworkState['networkType']) => void;
  updateLatency: (latency: number) => void;
  updateBlockHeight: (height: number) => void;
  updatePeers: (count: number) => void;
  updateBandwidth: (upload: number, download: number) => void;
  setError: (error: string | null) => void;
  reconnect: () => void;
  disconnect: () => void;
}

export type NetworkStore = NetworkState & NetworkActions;

const initialState: NetworkState = {
  isConnected: false,
  networkType: 'testnet',
  latency: null,
  lastBlockHeight: null,
  peers: 0,
  bandwidth: {
    upload: 0,
    download: 0,
  },
  connectionStatus: 'disconnected',
  error: null,
};

export const useNetworkStore = create<NetworkStore>()(
  devtools(
    logger(
      (set, get) => ({
        ...initialState,

        setConnectionStatus: (connectionStatus) => {
          const isConnected = connectionStatus === 'connected';
          set({ connectionStatus, isConnected });
        },

        setNetworkType: (networkType) => set({ networkType }),

        updateLatency: (latency) => set({ latency }),

        updateBlockHeight: (lastBlockHeight) => set({ lastBlockHeight }),

        updatePeers: (peers) => set({ peers }),

        updateBandwidth: (upload, download) => set({ bandwidth: { upload, download } }),

        setError: (error) => set({ error }),

        reconnect: () => {
          set({ connectionStatus: 'connecting', error: null });
          // Implementation would depend on actual network connection logic
          setTimeout(() => {
            set({ connectionStatus: 'connected', isConnected: true });
          }, 1000);
        },

        disconnect: () => {
          set({
            connectionStatus: 'disconnected',
            isConnected: false,
            latency: null,
            lastBlockHeight: null,
            peers: 0,
            bandwidth: { upload: 0, download: 0 },
          });
        },
      }),
      { name: 'network-store', enabled: true }
    ),
    { name: 'network-devtools', enabled: true }
  )
);

// Selectors for optimized re-renders
export const useNetwork = () => {
  const store = useNetworkStore();

  return {
    // Network state
    isConnected: store.isConnected,
    networkType: store.networkType,
    latency: store.latency,
    lastBlockHeight: store.lastBlockHeight,
    peers: store.peers,
    bandwidth: store.bandwidth,
    connectionStatus: store.connectionStatus,
    error: store.error,

    // Network actions
    setConnectionStatus: store.setConnectionStatus,
    setNetworkType: store.setNetworkType,
    updateLatency: store.updateLatency,
    updateBlockHeight: store.updateBlockHeight,
    updatePeers: store.updatePeers,
    updateBandwidth: store.updateBandwidth,
    setError: store.setError,
    reconnect: store.reconnect,
    disconnect: store.disconnect,
  };
};

// Selective selectors
export const useNetworkIsConnected = () => useNetworkStore((state) => state.isConnected);
export const useNetworkStatus = () => useNetworkStore((state) => state.connectionStatus);
export const useNetworkLatency = () => useNetworkStore((state) => state.latency);
export const useNetworkType = () => useNetworkStore((state) => state.networkType);
