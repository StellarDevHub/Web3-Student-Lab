'use client';

import { useGasCalculator } from '@/hooks/useGasCalculator';

export default function GasCalculatorPanel() {
  const {
    sourceCode,
    setSourceCode,
    budgetPreset,
    setBudgetPreset,
    result,
    error,
    isCalculating,
    estimate,
    budgetOptions,
  } = useGasCalculator();

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <section
        aria-label="Contract source input"
        className="bg-bg-secondary border-border-theme space-y-4 rounded-2xl border p-6"
      >
        <div>
          <label htmlFor="gas-source" className="text-text-secondary mb-2 block text-xs font-bold tracking-widest uppercase">
            Soroban Contract Source
          </label>
          <textarea
            id="gas-source"
            value={sourceCode}
            onChange={(e) => setSourceCode(e.target.value)}
            rows={16}
            className="bg-background border-border-theme text-foreground w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus:border-red-500"
          />
        </div>

        <div>
          <label htmlFor="gas-budget" className="text-text-secondary mb-2 block text-xs font-bold tracking-widest uppercase">
            Gas Budget Preset
          </label>
          <select
            id="gas-budget"
            value={budgetPreset}
            onChange={(e) => setBudgetPreset(e.target.value as typeof budgetPreset)}
            className="bg-background border-border-theme text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-red-500"
          >
            {budgetOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.key} ({opt.limit.toLocaleString()} gas)
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={estimate}
          disabled={isCalculating}
          aria-busy={isCalculating}
          className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-bold tracking-widest text-white uppercase transition hover:bg-red-700 disabled:opacity-50"
        >
          {isCalculating ? 'Estimating…' : 'Estimate Gas'}
        </button>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </section>

      <section aria-live="polite" className="bg-bg-secondary border-border-theme space-y-4 rounded-2xl border p-6">
        {!result ? (
          <p className="text-text-secondary text-sm">Run an estimate to see CPU, RAM, storage, and optimization strategies.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(['cpu', 'ram', 'storage', 'gas'] as const).map((metric) => (
                <div key={metric} className="rounded-lg border border-white/10 p-3 text-center">
                  <p className="text-text-secondary text-[10px] font-bold tracking-widest uppercase">{metric}</p>
                  <p className="text-foreground text-2xl font-black">{result.estimate[metric]}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-white/10 p-4">
              <p className="text-text-secondary text-xs font-bold tracking-widest uppercase">Budget ({result.budget.preset})</p>
              <p className={`text-lg font-bold ${result.budget.withinBudget ? 'text-green-400' : 'text-red-400'}`}>
                {result.budget.percentUsed}% used — {result.budget.headroom.toLocaleString()} headroom
              </p>
              <p className="text-text-secondary mt-2 text-sm">{result.recommendation}</p>
            </div>

            {result.estimate.warnings.length > 0 && (
              <ul className="space-y-2" role="list">
                {result.estimate.warnings.map((w) => (
                  <li key={w.metric} className="rounded border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-sm text-yellow-300">
                    {w.message}
                  </li>
                ))}
              </ul>
            )}

            <div>
              <h3 className="text-text-secondary mb-2 text-xs font-bold tracking-widest uppercase">Optimization Strategies</h3>
              <div className="space-y-2">
                {result.strategies.slice(0, 4).map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded border border-white/10 px-3 py-2 text-sm">
                    <span>{s.label}</span>
                    <span className="font-mono text-green-400">{s.gas.toLocaleString()} gas</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
