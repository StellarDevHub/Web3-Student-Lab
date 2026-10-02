'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  computeLiveness,
  computeSafety,
  computeSliceStatus,
  type SimulationState,
} from '../lib/scpSimulation';

interface Props {
  state: SimulationState;
  onToggleFailure: (id: string) => void;
}

export default function NetworkPartitionPanel({ state, onToggleFailure }: Props) {
  const [partitionSize, setPartitionSize] = useState(2);

  const sliceStatuses = useMemo(() => computeSliceStatus(state), [state]);
  const safe = useMemo(() => computeSafety(state), [state]);
  const live = useMemo(() => computeLiveness(state), [state]);

  const applyPartition = useCallback(() => {
    const active = state.nodes.filter((n) => !n.failed);
    const toFail = active.slice(0, partitionSize);
    for (const node of toFail) {
      onToggleFailure(node.id);
    }
  }, [state.nodes, partitionSize, onToggleFailure]);

  const recoverAll = useCallback(() => {
    for (const node of state.nodes) {
      if (node.failed) onToggleFailure(node.id);
    }
  }, [state.nodes, onToggleFailure]);

  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-6 space-4">
      <h
        <h2 className="text-lg font-bold text-slate-100">
          Network Partition Tests
        </h2>
        <p className="text-xs text-slate-400">
          Simulate validator failures to observe how quorum slices degrade.
        </p>
      </h>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Fail nodes:
          <input
            type="number"
            min={1}
            max={state.nodes.length}
            value={partitionSize}
            onChange={(e) => setPartitionSize(Number(e.target.value))}
            className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100"
          />
        </label>
        <button
          type="button"
          onClick={applyPartition}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white"
        >
          Apply Partition
        </button>
        <button
          type="button"
          onClick={recoverAll}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white"
        >
          Recover All
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-800/50 rounded lg p-3">
          <p className="text-slate-400">Safety</p>
          <p className={safe ? 'text-green-400' : 'text-red-400'}>
            {safe ? 'HOLDING' : 'VIOLATED'}
          </p>
        </div>
        <div className="bg-slate-800/50 rounded lg p-3">
          <p className="text-slate-400">Liveness</p>
          <p className={live ? 'text-green-400' : 'text-red-400'}>
            {live ? 'HOLDING' : 'VIOLATED'}
          </p>
        </div>
      </div>

      <ul className="space-y-2 text-xs">
        {sliceStatuses.map((slice) => (
          <li
            key={`partition-${slice.id}`}
            className="flex items-center justify-between bg-slate-800/40 rounded lg px-3 py-2"
          >
            <span className="text-slate-300">{slice.label}</span>
            <span className={slice.satisfied ? 'text-green-400' : 'text-amber-400'}>
              {slice.accepting}/{slice.threshold} accepting
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
