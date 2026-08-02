'use client';

import { useEffect, useRef } from 'react';

interface ResourceGaugeProps {
  label: string;
  value: number;
  max: number;
  warningAt: number;
  criticalAt: number;
  unit?: string;
}

function valueColor(value: number, warningAt: number, criticalAt: number): string {
  if (value >= criticalAt) {
    return '#ef4444';
  }

  if (value >= warningAt) {
    return '#f59e0b';
  }

  return '#10b981';
}

export function ResourceGauge({
  label,
  value,
  max,
  warningAt,
  criticalAt,
  unit = '%',
}: ResourceGaugeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animatedValueRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let rafId = 0;

    const drawGauge = (displayValue: number) => {
      const dpr = window.devicePixelRatio || 1;
      const width = 230;
      const height = 140;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = 120;
      const radius = 84;
      const start = Math.PI;
      const end = 2 * Math.PI;
      const ratio = Math.min(displayValue / max, 1);
      const activeEnd = start + (end - start) * ratio;

      ctx.lineWidth = 14;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.arc(centerX, centerY, radius, start, end, false);
      ctx.stroke();

      const gradient = ctx.createLinearGradient(20, 0, width - 20, 0);
      const activeColor = valueColor(displayValue, warningAt, criticalAt);
      gradient.addColorStop(0, activeColor);
      gradient.addColorStop(1, '#ffffff');

      ctx.beginPath();
      ctx.strokeStyle = gradient;
      ctx.arc(centerX, centerY, radius, start, activeEnd, false);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '700 14px var(--font-geist-mono), monospace';
      ctx.fillText(label.toUpperCase(), centerX, 24);

      ctx.font = '800 32px var(--font-geist-sans), sans-serif';
      ctx.fillText(`${Math.round(displayValue)}${unit}`, centerX, 88);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '600 11px var(--font-geist-mono), monospace';
      ctx.fillText(`threshold ${warningAt}${unit}`, centerX, 108);
    };

    const animate = () => {
      const target = value;
      const current = animatedValueRef.current;
      const delta = target - current;

      if (Math.abs(delta) < 0.2) {
        animatedValueRef.current = target;
        drawGauge(target);
        return;
      }

      animatedValueRef.current = current + delta * 0.12;
      drawGauge(animatedValueRef.current);
      rafId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [criticalAt, label, max, value, unit, warningAt]);

  return <canvas ref={canvasRef} aria-label={`${label} resource gauge`} />;
}
