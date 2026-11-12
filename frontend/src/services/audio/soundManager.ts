import { FeedbackSeverity } from '../../utils/haptics';

export interface ChimeToneSpec {
  frequenciesHz: number[];
  durationMs: number;
  waveform: OscillatorType;
}

export const CHIME_PROFILES: Record<FeedbackSeverity, ChimeToneSpec> = {
  success: {
    frequenciesHz: [523.25, 659.25, 783.99], // C5 -> E5 -> G5 pleasant major chime
    durationMs: 180,
    waveform: 'sine',
  },
  warning: {
    frequenciesHz: [440, 554.37], // A4 -> C#5 warm alert chime
    durationMs: 220,
    waveform: 'triangle',
  },
  error: {
    frequenciesHz: [349.23, 311.13], // F4 -> D#4 descending minor cue
    durationMs: 260,
    waveform: 'sawtooth',
  },
};

export class SoundManager {
  private volume: number = 0.6;
  private muted: boolean = false;
  private sharedContext: AudioContext | null = null;

  public setVolume(nextVolume: number): void {
    if (!Number.isFinite(nextVolume)) return;
    this.volume = Math.max(0, Math.min(1, nextVolume));
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getChimeSpec(severity: FeedbackSeverity): ChimeToneSpec {
    return CHIME_PROFILES[severity];
  }

  private resolveAudioContext(
    audioContextFactory?: () => AudioContext | null
  ): AudioContext | null {
    if (audioContextFactory) {
      return audioContextFactory();
    }
    if (this.sharedContext && this.sharedContext.state !== 'closed') {
      return this.sharedContext;
    }
    if (typeof window === 'undefined') {
      return null;
    }
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }
    this.sharedContext = new AudioCtx();
    return this.sharedContext;
  }

  public playEventChime(
    severity: FeedbackSeverity,
    audioContextFactory?: () => AudioContext | null
  ): boolean {
    if (this.muted || this.volume <= 0) {
      return false;
    }

    const spec = this.getChimeSpec(severity);
    try {
      const ctx = this.resolveAudioContext(audioContextFactory);
      if (!ctx) return false;

      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        void ctx.resume().catch(() => undefined);
      }

      const peakGain = Math.max(0.001, this.volume * 0.25);
      const toneSeconds = spec.durationMs / 1000;

      spec.frequenciesHz.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + idx * 0.06;
        const stop = start + toneSeconds;

        osc.type = spec.waveform;
        osc.frequency.value = freq;
        gain.gain.value = peakGain;

        if (
          typeof gain.gain.setValueAtTime === 'function' &&
          typeof gain.gain.exponentialRampToValueAtTime === 'function'
        ) {
          gain.gain.setValueAtTime(peakGain, start);
          gain.gain.exponentialRampToValueAtTime(0.0001, stop);
        }

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(stop);
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const defaultSoundManager = new SoundManager();
