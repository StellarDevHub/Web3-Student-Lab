'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Volume2, VolumeX, X } from 'lucide-react';
import { defaultSoundManager, SoundManager } from '../../services/audio/soundManager';
import { FeedbackSeverity, triggerHapticPulse } from '../../utils/haptics';

export interface ContractEventToast {
  id: string;
  contractTopic: 'token_transfer' | 'proposal_vote' | 'certificate_issuance' | string;
  title: string;
  description: string;
  severity: FeedbackSeverity;
  timestampIso?: string;
}

export const AUTO_DISMISS_MS = 5_000;

export interface EventToasterProps {
  events: ContractEventToast[];
  onDismiss?: (id: string) => void;
  soundManager?: SoundManager;
  autoDismissMs?: number;
}

const SEVERITY_STYLES: Record<
  FeedbackSeverity,
  { border: string; badge: string; icon: React.ReactNode }
> = {
  success: {
    border: 'border-emerald-500/40 bg-slate-950/95',
    badge: 'bg-emerald-500/20 text-emerald-300',
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />,
  },
  warning: {
    border: 'border-amber-500/40 bg-slate-950/95',
    badge: 'bg-amber-500/20 text-amber-300',
    icon: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />,
  },
  error: {
    border: 'border-rose-500/40 bg-slate-950/95',
    badge: 'bg-rose-500/20 text-rose-300',
    icon: <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />,
  },
};

interface ContractToastItemProps {
  event: ContractEventToast;
  autoDismissMs: number;
  onDismiss: (id: string) => void;
}

const ContractToastItem: React.FC<ContractToastItemProps> = ({
  event,
  autoDismissMs,
  onDismiss,
}) => {
  const style = SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES.success;

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(event.id);
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [event.id, autoDismissMs, onDismiss]);

  return (
    <div
      role="status"
      data-testid={`event-toast-${event.id}`}
      className={`animate-in slide-in-from-right-8 fade-in rounded-xl border p-3 text-xs text-slate-100 shadow-xl backdrop-blur transition-all duration-300 ease-out ${style.border}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {style.icon}
          <span className="font-semibold uppercase tracking-wider text-indigo-300">
            {event.contractTopic.replace(/_/g, ' ')}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style.badge}`}>
            {event.severity}
          </span>
        </div>
        <button
          type="button"
          aria-label={`Dismiss ${event.title}`}
          onClick={() => onDismiss(event.id)}
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1.5 font-medium text-white">{event.title}</p>
      <p className="mt-0.5 text-slate-400">{event.description}</p>
    </div>
  );
};

export const EventToaster: React.FC<EventToasterProps> = ({
  events,
  onDismiss,
  soundManager = defaultSoundManager,
  autoDismissMs = AUTO_DISMISS_MS,
}) => {
  const [volume, setVolume] = useState<number>(() => soundManager.getVolume());
  const [muted, setMuted] = useState<boolean>(() => soundManager.isMuted());
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(true);
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>({});

  const announcedIdsRef = useRef<Set<string>>(new Set());
  const hapticsEnabledRef = useRef<boolean>(hapticsEnabled);
  const onDismissRef = useRef<EventToasterProps['onDismiss']>(onDismiss);

  hapticsEnabledRef.current = hapticsEnabled;
  onDismissRef.current = onDismiss;

  useEffect(() => {
    for (const ev of events) {
      if (announcedIdsRef.current.has(ev.id)) continue;
      announcedIdsRef.current.add(ev.id);
      soundManager.playEventChime(ev.severity);
      triggerHapticPulse(ev.severity, hapticsEnabledRef.current);
    }
  }, [events, soundManager]);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    onDismissRef.current?.(id);
  }, []);

  const handleVolumeChange = (next: number) => {
    setVolume(next);
    soundManager.setVolume(next);
    if (next > 0 && muted) {
      setMuted(false);
      soundManager.setMuted(false);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    soundManager.setMuted(nextMuted);
  };

  const visibleEvents = events.filter((ev) => !dismissedIds[ev.id]);

  return (
    <aside
      aria-live="polite"
      aria-label="Smart contract event notifications"
      data-testid="contract-event-toaster"
      className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-slate-200 shadow-lg">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="toggle-mute-btn"
            aria-label={muted ? 'Unmute audio chimes' : 'Mute audio chimes'}
            aria-pressed={muted}
            onClick={handleToggleMute}
            className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={volume}
            aria-label="Audio Chime Volume"
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            className="w-24 accent-indigo-400"
          />
        </div>
        <button
          type="button"
          data-testid="toggle-haptics-btn"
          aria-pressed={hapticsEnabled}
          onClick={() => setHapticsEnabled((prev) => !prev)}
          className="rounded bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-slate-700"
        >
          Haptics: {hapticsEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {visibleEvents.map((ev) => (
        <ContractToastItem
          key={ev.id}
          event={ev}
          autoDismissMs={autoDismissMs}
          onDismiss={handleDismiss}
        />
      ))}
    </aside>
  );
};
