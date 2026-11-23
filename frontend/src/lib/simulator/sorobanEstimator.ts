export type ResourceLevel = 'safe' | 'warning' | 'critical';

export interface EstimatorWarning {
  metric: 'cpu' | 'ram' | 'storage' | 'gas';
  level: ResourceLevel;
  message: string;
}

export interface SorobanEstimate {
  cpu: number;
  ram: number;
  storage: number;
  gas: number;
  confidence: number;
  warnings: EstimatorWarning[];
  benchmarkVersion: string;
}

export interface StrategyComparison {
  id: string;
  label: string;
  description: string;
  cpu: number;
  ram: number;
  storage: number;
  gas: number;
  savings: number;
}

interface FeatureVector {
  lines: number;
  loops: number;
  nestedLoops: number;
  branching: number;
  storageReads: number;
  storageWrites: number;
  mapOps: number;
  vecOps: number;
  hashOps: number;
  authChecks: number;
  eventEmits: number;
  crossContractCalls: number;
  serializations: number;
  arithmeticOps: number;
}

const BENCHMARK_PROFILE = {
  version: 'soroban-testnet-2026q1',
  baseCpu: 16,
  baseRam: 14,
  baseStorage: 8,
  cpuPerLine: 0.24,
  ramPerLine: 0.18,
  loopCpu: 12,
  nestedLoopCpu: 30,
  branchCpu: 4,
  branchRam: 1.2,
  readStorage: 5,
  writeStorage: 17,
  mapCpu: 6,
  mapRam: 5,
  vecCpu: 4,
  vecRam: 3,
  hashCpu: 18,
  hashRam: 3,
  authCpu: 8,
  authRam: 1,
  eventCpu: 5,
  eventStorage: 2,
  crossCallCpu: 20,
  crossCallRam: 6,
  serializationCpu: 7,
  serializationRam: 6,
  arithmeticCpu: 0.28,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(pattern) || []).length;
}

function extractFeatures(code: string): FeatureVector {
  const source = code.toLowerCase();
  const lines = code
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;

  return {
    lines,
    loops: countMatches(source, /\b(for|while|loop)\b/g),
    nestedLoops: countMatches(source, /\bfor\b[\s\S]{0,140}\bfor\b/g),
    branching: countMatches(source, /\b(if|match|else if)\b/g),
    storageReads: countMatches(source, /\b(get|load|instance\(\)\.get|persistent\(\)\.get)\b/g),
    storageWrites: countMatches(
      source,
      /\b(set|put|instance\(\)\.set|persistent\(\)\.set|remove)\b/g
    ),
    mapOps: countMatches(source, /\bmap\b/g),
    vecOps: countMatches(source, /\bvec\b/g),
    hashOps: countMatches(source, /\bsha256|keccak|hash\b/g),
    authChecks: countMatches(source, /\brequire_auth|authorize\b/g),
    eventEmits: countMatches(source, /\bevents?\.|publish\b/g),
    crossContractCalls: countMatches(source, /\binvoke|contractclient|call\b/g),
    serializations: countMatches(source, /\bserialize|deserialize|from_xdr|to_xdr\b/g),
    arithmeticOps: countMatches(source, /[+\-*/%]/g),
  };
}

export function estimateSorobanResources(code: string): SorobanEstimate {
  const features = extractFeatures(code);

  const cpuRaw =
    BENCHMARK_PROFILE.baseCpu +
    features.lines * BENCHMARK_PROFILE.cpuPerLine +
    features.loops * BENCHMARK_PROFILE.loopCpu +
    features.nestedLoops * BENCHMARK_PROFILE.nestedLoopCpu +
    features.branching * BENCHMARK_PROFILE.branchCpu +
    features.storageReads * BENCHMARK_PROFILE.readStorage +
    features.storageWrites * BENCHMARK_PROFILE.writeStorage * 0.35 +
    features.mapOps * BENCHMARK_PROFILE.mapCpu +
    features.vecOps * BENCHMARK_PROFILE.vecCpu +
    features.hashOps * BENCHMARK_PROFILE.hashCpu +
    features.authChecks * BENCHMARK_PROFILE.authCpu +
    features.eventEmits * BENCHMARK_PROFILE.eventCpu +
    features.crossContractCalls * BENCHMARK_PROFILE.crossCallCpu +
    features.serializations * BENCHMARK_PROFILE.serializationCpu +
    features.arithmeticOps * BENCHMARK_PROFILE.arithmeticCpu;

  const ramRaw =
    BENCHMARK_PROFILE.baseRam +
    features.lines * BENCHMARK_PROFILE.ramPerLine +
    features.branching * BENCHMARK_PROFILE.branchRam +
    features.mapOps * BENCHMARK_PROFILE.mapRam +
    features.vecOps * BENCHMARK_PROFILE.vecRam +
    features.hashOps * BENCHMARK_PROFILE.hashRam +
    features.authChecks * BENCHMARK_PROFILE.authRam +
    features.crossContractCalls * BENCHMARK_PROFILE.crossCallRam +
    features.serializations * BENCHMARK_PROFILE.serializationRam;

  const storageRaw =
    BENCHMARK_PROFILE.baseStorage +
    features.storageReads * 2 +
    features.storageWrites * BENCHMARK_PROFILE.writeStorage +
    features.eventEmits * BENCHMARK_PROFILE.eventStorage;

  const cpu = clamp(Math.round(cpuRaw), 2, 100);
  const ram = clamp(Math.round(ramRaw), 2, 100);
  const storage = clamp(Math.round(storageRaw), 1, 100);

  const gas = Math.round(cpu * 52 + ram * 34 + storage * 88 + features.crossContractCalls * 220);

  const confidence = clamp(
    Math.round(
      60 + Math.min(features.lines, 120) * 0.25 + Math.min(features.storageWrites, 12) * 1.1
    ),
    62,
    93
  );

  const warnings: EstimatorWarning[] = [];

  if (cpu >= 75) {
    warnings.push({
      metric: 'cpu',
      level: cpu >= 90 ? 'critical' : 'warning',
      message: 'CPU is high. Reduce nested loops or cache repeated reads.',
    });
  }

  if (ram >= 72) {
    warnings.push({
      metric: 'ram',
      level: ram >= 88 ? 'critical' : 'warning',
      message: 'RAM pressure detected. Prefer compact structs and avoid large vectors.',
    });
  }

  if (storage >= 68) {
    warnings.push({
      metric: 'storage',
      level: storage >= 85 ? 'critical' : 'warning',
      message: 'Storage writes are expensive. Batch writes or compress key payloads.',
    });
  }

  if (gas >= 8500) {
    warnings.push({
      metric: 'gas',
      level: gas >= 11000 ? 'critical' : 'warning',
      message: 'Estimated gas exceeds typical classroom budget for a single invocation.',
    });
  }

  return {
    cpu,
    ram,
    storage,
    gas,
    confidence,
    warnings,
    benchmarkVersion: BENCHMARK_PROFILE.version,
  };
}

function scaleMetrics(
  baseline: SorobanEstimate,
  factors: { cpu: number; ram: number; storage: number }
): Omit<StrategyComparison, 'id' | 'label' | 'description' | 'savings'> {
  const cpu = clamp(Math.round(baseline.cpu * factors.cpu), 1, 100);
  const ram = clamp(Math.round(baseline.ram * factors.ram), 1, 100);
  const storage = clamp(Math.round(baseline.storage * factors.storage), 1, 100);
  const gas = Math.round(cpu * 52 + ram * 34 + storage * 88);

  return { cpu, ram, storage, gas };
}

export function buildStrategyComparisons(baseline: SorobanEstimate): StrategyComparison[] {
  const baselineRow: StrategyComparison = {
    id: 'baseline',
    label: 'Current Contract',
    description: 'No optimization applied.',
    cpu: baseline.cpu,
    ram: baseline.ram,
    storage: baseline.storage,
    gas: baseline.gas,
    savings: 0,
  };

  const cache = scaleMetrics(baseline, { cpu: 0.82, ram: 0.9, storage: 0.96 });
  const batch = scaleMetrics(baseline, { cpu: 0.9, ram: 0.95, storage: 0.74 });
  const compact = scaleMetrics(baseline, { cpu: 0.95, ram: 0.82, storage: 0.78 });
  const hybrid = scaleMetrics(baseline, { cpu: 0.76, ram: 0.78, storage: 0.66 });

  const rows: StrategyComparison[] = [
    baselineRow,
    {
      id: 'cache-reads',
      label: 'Cache Hot Reads',
      description: 'Memoize instance and persistent reads across branches.',
      ...cache,
      savings: baseline.gas - cache.gas,
    },
    {
      id: 'batch-writes',
      label: 'Batch Storage Writes',
      description: 'Accumulate state changes and persist once per call.',
      ...batch,
      savings: baseline.gas - batch.gas,
    },
    {
      id: 'compact-layout',
      label: 'Compact Data Layout',
      description: 'Use tighter key/value formats and slimmer event payloads.',
      ...compact,
      savings: baseline.gas - compact.gas,
    },
    {
      id: 'hybrid',
      label: 'Hybrid Optimization',
      description: 'Combination of caching, batching, and compact schema choices.',
      ...hybrid,
      savings: baseline.gas - hybrid.gas,
    },
  ];

  return rows.sort((a, b) => a.gas - b.gas);
}
