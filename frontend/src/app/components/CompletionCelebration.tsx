'use client';

import React, { useEffect, useRef } from 'react';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { Volume2, VolumeX, Zap, ZapOff, Sparkles } from 'lucide-react';

// Play celebratory chime/chord chime using Web Audio API
export function playCelebrationSound(isMuted: boolean): AudioContext | null {
  if (isMuted || typeof window === 'undefined') return null;

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Harmonious C-major 9 chord arpeggio chime (C4, E4, G4, B4, C5, E5, G5)
    const freqs = [261.63, 329.63, 392.00, 493.88, 523.25, 659.25, 783.99];
    const delayStep = 0.08;

    freqs.forEach((freq, index) => {
      const delay = index * delayStep;
      const noteTime = now + delay;

      // Primary tone (triangle wave for soft bell/chime quality)
      const osc1 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, noteTime);

      // Higher harmonic (sine wave, 1 octave up for extra shine)
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, noteTime);

      const gain1 = ctx.createGain();
      const gain2 = ctx.createGain();

      // Envelope: soft attack, fast decay to zero
      gain1.gain.setValueAtTime(0, noteTime);
      gain1.gain.linearRampToValueAtTime(0.12, noteTime + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.0001, noteTime + 1.2);

      gain2.gain.setValueAtTime(0, noteTime);
      gain2.gain.linearRampToValueAtTime(0.04, noteTime + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.8);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(noteTime);
      osc2.start(noteTime);

      osc1.stop(noteTime + 1.5);
      osc2.stop(noteTime + 1.5);
    });

    return ctx;
  } catch (err) {
    console.error('Failed to play celebration sound:', err);
    return null;
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  width: number;
  height: number;
  rotation: number;
  rotationSpeed: number;
  wobble: number;
  wobbleSpeed: number;
}

export function CelebrationOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { preferences } = useUserPreferences();

  // Settings derived from user preferences & media queries
  const isMuted = !preferences.learning.soundEffects;
  const isReducedMotion = preferences.accessibility.reducedMotion;

  useEffect(() => {
    // 1. Play sound
    const audioCtx = playCelebrationSound(isMuted);

    // 2. Play confetti animation
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect reduced motion: if set, skip particle simulation entirely
    const mediaReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReducedMotion || mediaReducedMotion) {
      return () => {
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close();
        }
      };
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Vibrant confetti colors
    const colors = [
      '#ef4444', // Red
      '#f97316', // Orange
      '#f59e0b', // Yellow
      '#10b981', // Emerald
      '#06b6d4', // Cyan
      '#3b82f6', // Blue
      '#8b5cf6', // Violet
      '#ec4899', // Pink
    ];

    const particles: Particle[] = [];

    // Create dual-cannon blast: Left and Right corners shooting upwards
    const numParticles = 140;
    for (let i = 0; i < numParticles; i++) {
      const isLeft = i < numParticles / 2;
      particles.push({
        x: isLeft ? 0 : width,
        y: height - 20,
        vx: isLeft
          ? 6 + Math.random() * 8
          : -6 - Math.random() * 8,
        vy: -15 - Math.random() * 12,
        color: colors[Math.floor(Math.random() * colors.length)],
        width: 6 + Math.random() * 8,
        height: 12 + Math.random() * 8,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: -0.1 + Math.random() * 0.2,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.05 + Math.random() * 0.1,
      });
    }

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      let activeParticles = 0;

      particles.forEach((p) => {
        // Physics update
        p.vy += 0.4; // Gravity
        p.vx *= 0.98; // Air resistance
        p.vy *= 0.98;

        p.rotation += p.rotationSpeed;
        p.wobble += p.wobbleSpeed;

        p.x += p.vx + Math.sin(p.wobble) * 0.6;
        p.y += p.vy;

        // Render if on screen
        if (p.y < height + 20 && p.x > -20 && p.x < width + 20) {
          activeParticles++;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
          ctx.restore();
        }
      });

      if (activeParticles > 0) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animate();

    // Clean up animation loop and audio context on unmount to guarantee zero memory leaks
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close();
      }
    };
  }, [isMuted, isReducedMotion]);

  // If reduced motion matches, render nothing
  const mediaReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isReducedMotion || mediaReducedMotion) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}

// Backward compatibility function
export function launchCompletionConfetti() {
  // The new engine is tied directly to React mount cycle of the CelebrationOverlay component,
  // preventing memory leaks automatically.
}

interface CompletionModalProps {
  onClose: () => void;
}

export function CompletionModal({ onClose }: CompletionModalProps) {
  const { preferences, updatePreferences } = useUserPreferences();

  const isMuted = !preferences.learning.soundEffects;
  const isReducedMotion = preferences.accessibility.reducedMotion;

  const toggleSound = () => {
    updatePreferences({
      learning: {
        ...preferences.learning,
        soundEffects: isMuted,
      },
    });
  };

  const toggleMotion = () => {
    updatePreferences({
      accessibility: {
        ...preferences.accessibility,
        reducedMotion: !isReducedMotion,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4 backdrop-blur-md">
      <CelebrationOverlay />
      
      <div className="w-full max-w-lg rounded-3xl border border-red-500/20 bg-neutral-950 p-8 text-center shadow-[0_0_50px_rgba(220,38,38,0.2)] relative z-10">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-red-500/10 border border-red-500/30 text-5xl relative overflow-hidden">
          <div className="absolute inset-0 bg-red-500/10 animate-pulse" />
          <span className="relative z-10">🎉</span>
        </div>
        
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500 flex items-center justify-center gap-1">
          <Sparkles className="w-3.5 h-3.5" /> Course Complete
        </p>
        
        <h2 className="mt-4 text-4xl font-black tracking-tight text-white uppercase">
          Congratulations!
        </h2>
        
        <p className="mt-4 text-sm leading-relaxed text-gray-400">
          You completed every module requirement in Web3 Student Lab. You've earned full credits and unlocked your smart certificate mint option!
        </p>

        {/* User Preference Toggles */}
        <div className="mt-8 flex items-center justify-center gap-6 border-t border-white/5 pt-6">
          <button
            onClick={toggleSound}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest border transition-all ${
              !isMuted
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-white/5 border-transparent text-gray-500 hover:bg-white/10'
            }`}
            title={isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
            aria-label={isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {isMuted ? 'Muted' : 'Audio On'}
          </button>

          <button
            onClick={toggleMotion}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest border transition-all ${
              !isReducedMotion
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-white/5 border-transparent text-gray-500 hover:bg-white/10'
            }`}
            title={isReducedMotion ? 'Enable Confetti Motion' : 'Disable Confetti Motion'}
            aria-label={isReducedMotion ? 'Enable Confetti Motion' : 'Disable Confetti Motion'}
          >
            {isReducedMotion ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {isReducedMotion ? 'No Motion' : 'Motion On'}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-8 w-full rounded-2xl bg-red-600 py-4 text-xs font-black uppercase tracking-[0.2em] text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] transition hover:bg-red-500 hover:scale-[1.02]"
        >
          Continue learning
        </button>
      </div>
    </div>
  );
}
