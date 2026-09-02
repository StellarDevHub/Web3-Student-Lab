'use client';

import { useState, useCallback } from 'react';
import { useDependencyUpdates, type DependencyInfo } from '@/hooks/useDependencyUpdates';

const BADGE_STYLES: Record<string, string> = {
  major: 'bg-red-500/20 text-red-400 border-red-500/30',
  minor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  patch: 'bg-green-500/20 text-green-400 border-green-500/30',
  none: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30',
};

interface DependencyUpdatePanelProps {
  cargoToml: string;
  onCargoTomlUpdate?: (updated: string) => void;
}

export function DependencyUpdatePanel({ cargoToml, onCargoTomlUpdate }: DependencyUpdatePanelProps) {
  const { checkResult, updateResult, isChecking, isUpdating, error, checkDependencies, applyUpdates, reset } =
    useDependencyUpdates();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const handleCheck = useCallback(() => {
    setSelected(new Set());
    reset();
    checkDependencies(cargoToml);
  }, [cargoToml, checkDependencies, reset]);

  const toggleDep = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!checkResult) return;
    const outdated = checkResult.dependencies.filter((d) => d.isOutdated).map((d) => d.name);
    setSelected((prev) => (prev.size === outdated.length ? new Set() : new Set(outdated)));
  }, [checkResult]);

  const handleUpdate = useCallback(async () => {
    if (!selected.size) return;
    await applyUpdates(cargoToml, Array.from(selected));
  }, [cargoToml, selected, applyUpdates]);

  const handleCopy = useCallback(async () => {
    if (!updateResult?.suggestedCargoToml) return;
    await navigator.clipboard.writeText(updateResult.suggestedCargoToml);
    onCargoTomlUpdate?.(updateResult.suggestedCargoToml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [updateResult, onCargoTomlUpdate]);

  const outdatedDeps = checkResult?.dependencies.filter((d) => d.isOutdated) ?? [];
  const upToDateDeps = checkResult?.dependencies.filter((d) => !d.isOutdated) ?? [];

  return (
    <section
      aria-label="Dependency Update Panel"
      className="rounded-3xl border border-white/10 bg-zinc-950 p-6 sm:p-8"
    >
      <div className="mb-6 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-black tracking-widest text-white uppercase">
            Dependency Updater
          </h3>
          <p className="mt-1 text-[10px] text-zinc-500">Check and update your Cargo.toml dependencies</p>
        </div>
        <button
          onClick={handleCheck}
          disabled={isChecking || !cargoToml}
          className="rounded-xl bg-red-600 px-4 py-2 text-[10px] font-black tracking-widest text-white uppercase transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Check dependencies for updates"
        >
          {isChecking ? 'Checking…' : 'Check'}
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {checkResult && !updateResult && (
        <>
          <div className="mb-4 flex items-center gap-4 text-[10px] text-zinc-400 uppercase tracking-widest">
            <span>
              <span className="text-white font-bold">{checkResult.dependencies.length}</span> deps scanned
            </span>
            <span>
              <span className={outdatedDeps.length > 0 ? 'text-yellow-400 font-bold' : 'text-green-400 font-bold'}>
                {checkResult.outdatedCount}
              </span>{' '}
              outdated
            </span>
          </div>

          {outdatedDeps.length > 0 && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase">
                  Outdated
                </span>
                <button
                  onClick={toggleAll}
                  className="text-[10px] text-red-400 hover:text-red-300 underline underline-offset-2"
                  aria-label={selected.size === outdatedDeps.length ? 'Deselect all' : 'Select all outdated'}
                >
                  {selected.size === outdatedDeps.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <ul className="mb-4 space-y-2" role="list">
                {outdatedDeps.map((dep) => (
                  <DepRow key={dep.name} dep={dep} selected={selected.has(dep.name)} onToggle={toggleDep} />
                ))}
              </ul>
              <button
                onClick={handleUpdate}
                disabled={isUpdating || selected.size === 0}
                className="w-full rounded-xl bg-red-600 py-3 text-[10px] font-black tracking-widest text-white uppercase transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Apply ${selected.size} selected update${selected.size !== 1 ? 's' : ''}`}
              >
                {isUpdating ? 'Applying…' : `Apply ${selected.size} Update${selected.size !== 1 ? 's' : ''}`}
              </button>
            </>
          )}

          {upToDateDeps.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-[10px] font-bold tracking-widest text-zinc-500 uppercase hover:text-zinc-300">
                Up-to-date ({upToDateDeps.length})
              </summary>
              <ul className="mt-2 space-y-1" role="list">
                {upToDateDeps.map((dep) => (
                  <li key={dep.name} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs text-zinc-500">
                    <span>{dep.name}</span>
                    <span className="font-mono text-green-500/70">{dep.currentVersion}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {outdatedDeps.length === 0 && (
            <p className="text-center text-xs text-green-400">
              ✓ All dependencies are up-to-date
            </p>
          )}
        </>
      )}

      {updateResult && (
        <div className="space-y-4">
          <div className="flex gap-6 text-[10px] uppercase tracking-widest">
            <span>
              <span className="font-bold text-green-400">{updateResult.updated.length}</span> updated
            </span>
            {updateResult.failed.length > 0 && (
              <span>
                <span className="font-bold text-red-400">{updateResult.failed.length}</span> failed
              </span>
            )}
          </div>
          {updateResult.updated.length > 0 && (
            <ul className="space-y-1" role="list">
              {updateResult.updated.map((name) => (
                <li key={name} className="flex items-center gap-2 text-xs text-green-400">
                  <span aria-hidden>✓</span> {name}
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={handleCopy}
            className="w-full rounded-xl border border-white/10 py-3 text-[10px] font-black tracking-widest text-white uppercase transition hover:border-red-500/40"
            aria-label="Copy updated Cargo.toml to clipboard"
          >
            {copied ? '✓ Copied!' : 'Copy Updated Cargo.toml'}
          </button>
          <button
            onClick={() => { reset(); setSelected(new Set()); }}
            className="w-full text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
          >
            Run another check
          </button>
        </div>
      )}
    </section>
  );
}

function DepRow({
  dep,
  selected,
  onToggle,
}: {
  dep: DependencyInfo;
  selected: boolean;
  onToggle: (name: string) => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/5 bg-black/30 px-3 py-3 transition hover:border-red-500/20">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(dep.name)}
          className="mt-0.5 h-4 w-4 accent-red-600"
          aria-label={`Select ${dep.name} for update`}
        />
        <div className="flex flex-grow flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-white truncate">{dep.name}</span>
            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${BADGE_STYLES[dep.updateType]}`}>
              {dep.updateType}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <span className="font-mono">{dep.currentVersion}</span>
            <span aria-hidden>→</span>
            <span className="font-mono text-green-400">{dep.latestVersion}</span>
          </div>
          {dep.releaseNotes && (
            <p className="text-[10px] text-zinc-500 leading-relaxed">{dep.releaseNotes}</p>
          )}
        </div>
      </label>
    </li>
  );
}
