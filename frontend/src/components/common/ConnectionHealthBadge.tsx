'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useConnectionHealth } from '@/hooks/useConnectionHealth';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Server,
  Radio,
  Cpu,
  Globe,
  X,
  ExternalLink,
} from 'lucide-react';
import type { HealthStatus, ServiceHealth } from '@/lib/env';

export interface ConnectionHealthBadgeProps {
  className?: string;
  showDetailsOnClick?: boolean;
}

const statusColors: Record<HealthStatus, { bg: string; text: string; border: string; dot: string }> = {
  healthy: {
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]',
  },
  degraded: {
    bg: 'bg-amber-950/40',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]',
  },
  offline: {
    bg: 'bg-rose-950/40',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]',
  },
  checking: {
    bg: 'bg-cyan-950/40',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    dot: 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.7)]',
  },
  unknown: {
    bg: 'bg-zinc-900/50',
    text: 'text-zinc-400',
    border: 'border-zinc-700/30',
    dot: 'bg-zinc-500',
  },
};

const serviceIcons = {
  api: Server,
  ws: Radio,
  sorobanRpc: Cpu,
  horizon: Globe,
};

export function ConnectionHealthBadge({
  className = '',
  showDetailsOnClick = true,
}: ConnectionHealthBadgeProps) {
  const { matrix, fallbacks, isChecking, overallStatus, refresh, lastChecked } = useConnectionHealth();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close when clicked outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const style = statusColors[overallStatus] || statusColors.unknown;

  const getLabel = () => {
    if (isChecking && !lastChecked) return 'Checking Matrix...';
    if (overallStatus === 'offline') return 'Network Offline';
    if (fallbacks.hasAnyFallback) return 'Fallback Mode';
    if (overallStatus === 'degraded') return 'Degraded Service';
    return 'Systems Operational';
  };

  const services: ServiceHealth[] = [
    matrix.api,
    matrix.ws,
    matrix.sorobanRpc,
    matrix.horizon,
  ];

  return (
    <div className={`relative inline-block ${className}`} ref={panelRef}>
      {/* Compact Interactive Badge */}
      <button
        type="button"
        onClick={() => showDetailsOnClick && setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="View Connection Health Matrix & Fallback Status"
        className={`group inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold tracking-wider transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${style.bg} ${style.border} ${style.text} backdrop-blur-md`}
      >
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
              overallStatus === 'healthy' || overallStatus === 'checking'
                ? 'animate-ping'
                : 'animate-pulse'
            } ${style.dot}`}
          />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${style.dot}`} />
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider">
          {getLabel()}
        </span>
        <Activity className="h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-hover:rotate-12" />
      </button>

      {/* Health Matrix Modal / Dropdown */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Connection Health Matrix"
          className="absolute right-0 top-full z-50 mt-3 w-80 sm:w-96 rounded-2xl border border-white/10 bg-zinc-950/95 p-5 shadow-2xl backdrop-blur-2xl ring-1 ring-white/5 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-red-500" />
              <h3 className="font-mono text-xs font-black uppercase tracking-wider text-white">
                Connection Health Matrix
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={isChecking}
                aria-label="Re-check connections"
                title="Re-probe all connections"
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin text-red-500' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close health matrix"
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Fallback Notice if active */}
          {fallbacks.hasAnyFallback && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-950/30 p-2.5 text-[11px] text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <div>
                <span className="font-bold">Automatic Fallback Active:</span> One or more services are
                running with default endpoints because explicit environment variables were omitted.
              </div>
            </div>
          )}

          {/* Service Matrix Grid */}
          <div className="mt-4 space-y-2.5">
            {services.map((item) => {
              const Icon = serviceIcons[item.service] || Server;
              const itemStyle = statusColors[item.status] || statusColors.unknown;

              return (
                <div
                  key={item.service}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-zinc-400" />
                      <span className="font-mono text-xs font-bold text-zinc-200">
                        {item.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.isFallback && (
                        <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-400 uppercase">
                          Fallback
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${itemStyle.bg} ${itemStyle.border} ${itemStyle.text}`}
                      >
                        {item.status === 'healthy' && <CheckCircle2 className="h-3 w-3" />}
                        {item.status === 'degraded' && <AlertTriangle className="h-3 w-3" />}
                        {item.status === 'offline' && <XCircle className="h-3 w-3" />}
                        {item.status === 'checking' && (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        )}
                        {item.status}
                      </span>
                    </div>
                  </div>

                  {/* Endpoint Details */}
                  <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
                    <span className="truncate max-w-[200px] font-mono text-zinc-400" title={item.url}>
                      {item.url || 'No URL configured'}
                    </span>
                    {item.latencyMs !== undefined && (
                      <span className="font-mono font-medium text-zinc-400">
                        {item.latencyMs}ms
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Metadata */}
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[10px] text-zinc-500 font-mono">
            <span>
              Path Normalizer: <span className="text-emerald-400 font-semibold">Strict</span>
            </span>
            <span>
              {lastChecked ? `Checked ${new Date(lastChecked).toLocaleTimeString()}` : 'Probing...'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConnectionHealthBadge;
