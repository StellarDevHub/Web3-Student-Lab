import { ExplorerAdapter, ExplorerMode, GetSnapshotOptions } from './blockExplorerAdapter.js';
import { LiveStellarExplorerAdapter } from './liveStellarExplorerAdapter.js';
import { SimulationExplorerAdapter } from './simulationExplorerAdapter.js';

let defaultSimulationAdapter: SimulationExplorerAdapter | null = null;
let defaultLiveAdapter: LiveStellarExplorerAdapter | null = null;

export function resolveExplorerMode(options?: GetSnapshotOptions): ExplorerMode {
  if (options?.mode === 'simulation' || options?.mode === 'live') {
    return options.mode;
  }
  if (options?.useSimulation !== undefined) {
    return options.useSimulation ? 'simulation' : 'live';
  }

  const envMode = process.env.BLOCK_EXPLORER_MODE?.toLowerCase();
  if (envMode === 'simulation' || envMode === 'simulated') {
    return 'simulation';
  }
  if (envMode === 'live') {
    return 'live';
  }

  const envUseSim = process.env.USE_SIMULATED_EXPLORER?.toLowerCase();
  if (envUseSim === 'true' || envUseSim === '1') {
    return 'simulation';
  }

  // Default to live mode if not explicitly overridden
  return 'live';
}

export function getExplorerAdapter(options?: GetSnapshotOptions): ExplorerAdapter {
  const mode = resolveExplorerMode(options);

  if (mode === 'simulation') {
    if (!defaultSimulationAdapter) {
      defaultSimulationAdapter = new SimulationExplorerAdapter();
    }
    return defaultSimulationAdapter;
  }

  if (!defaultLiveAdapter) {
    defaultLiveAdapter = new LiveStellarExplorerAdapter();
  }
  return defaultLiveAdapter;
}
