import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_DISMISS_MS, ContractEventToast, EventToaster } from './index';
import { CHIME_PROFILES, SoundManager } from '../../services/audio/soundManager';
import { HAPTIC_PATTERNS, triggerHapticPulse } from '../../utils/haptics';

function createMockAudioContext() {
  const oscillators: Array<{
    type: string;
    frequency: { value: number };
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];

  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
  };

  return { ctx: ctx as unknown as AudioContext, oscillators };
}

describe('Smart Contract Event Feed Audio & Haptic Feedback (#1560)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('plays distinct Web Audio API chimes for success, warning, and error severities', () => {
    const manager = new SoundManager();
    const { ctx, oscillators } = createMockAudioContext();

    expect(manager.playEventChime('success', () => ctx)).toBe(true);
    expect(oscillators.map((o) => o.frequency.value)).toEqual(CHIME_PROFILES.success.frequenciesHz);

    oscillators.length = 0;
    expect(manager.playEventChime('warning', () => ctx)).toBe(true);
    expect(oscillators.map((o) => o.frequency.value)).toEqual(CHIME_PROFILES.warning.frequenciesHz);

    oscillators.length = 0;
    expect(manager.playEventChime('error', () => ctx)).toBe(true);
    expect(oscillators.map((o) => o.frequency.value)).toEqual(CHIME_PROFILES.error.frequenciesHz);
  });

  it('respects user volume and mute settings when triggering chimes', () => {
    const manager = new SoundManager();
    const { ctx } = createMockAudioContext();

    manager.setVolume(0.8);
    expect(manager.getVolume()).toBe(0.8);

    manager.setMuted(true);
    expect(manager.playEventChime('success', () => ctx)).toBe(false);

    manager.setMuted(false);
    manager.setVolume(0);
    expect(manager.playEventChime('success', () => ctx)).toBe(false);
  });

  it('triggers mobile navigator.vibrate haptic pulses when enabled and suppresses when disabled', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    expect(triggerHapticPulse('warning', true, { vibrate: vibrateMock })).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith(HAPTIC_PATTERNS.warning);

    expect(triggerHapticPulse('warning', false, { vibrate: vibrateMock })).toBe(false);
    expect(vibrateMock).toHaveBeenCalledTimes(1);
  });

  it('renders slide-in contract event toasts, auto-dismisses each independently after 5 seconds, and does not re-play chimes on settings toggles', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, 'vibrate', {
      configurable: true,
      value: vibrateMock,
    });

    const manager = new SoundManager();
    const playSpy = vi.spyOn(manager, 'playEventChime').mockReturnValue(true);
    const onDismiss = vi.fn();

    const firstEvent: ContractEventToast = {
      id: 'evt-1',
      contractTopic: 'token_transfer',
      title: 'Received 250 XLM',
      description: 'Transfer confirmed on Soroban testnet',
      severity: 'success',
    };

    const { rerender } = render(
      <EventToaster events={[firstEvent]} soundManager={manager} onDismiss={onDismiss} />
    );

    const toast1 = screen.getByTestId('event-toast-evt-1');
    expect(toast1).toHaveClass('slide-in-from-right-8');
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(vibrateMock).toHaveBeenCalledWith(HAPTIC_PATTERNS.success);

    // Advance 2s, toggle haptics OFF, and change volume: existing toast must NOT re-play chime or lose its remaining 3s timer
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(screen.getByTestId('toggle-haptics-btn'));
    expect(screen.getByTestId('toggle-haptics-btn')).toHaveTextContent('Haptics: OFF');
    fireEvent.change(screen.getByLabelText('Audio Chime Volume'), {
      target: { value: '0.3' },
    });
    expect(manager.getVolume()).toBe(0.3);
    expect(playSpy).toHaveBeenCalledTimes(1);

    // Arrival of a second event plays chime once, skips haptics (now OFF), and keeps evt-1's timer intact
    const secondEvent: ContractEventToast = {
      id: 'evt-2',
      contractTopic: 'proposal_vote',
      title: 'Governance Vote Recorded',
      description: 'Proposal #42 quorum reached',
      severity: 'warning',
    };
    rerender(
      <EventToaster
        events={[firstEvent, secondEvent]}
        soundManager={manager}
        onDismiss={onDismiss}
      />
    );
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(vibrateMock).toHaveBeenCalledTimes(1);

    // Advance 3s (total 5s since evt-1): evt-1 auto-dismisses while evt-2 remains for 2s more
    act(() => {
      vi.advanceTimersByTime(AUTO_DISMISS_MS - 2_000);
    });
    expect(screen.queryByTestId('event-toast-evt-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('event-toast-evt-2')).toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledWith('evt-1');

    // Advance remaining 2s: evt-2 auto-dismisses cleanly
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.queryByTestId('event-toast-evt-2')).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledWith('evt-2');
  });
});
