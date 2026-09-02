'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './SplitScreenLayout.module.css';

interface SplitScreenLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  minWidthPercent?: number;
  initialWidthPercent?: number;
}

export default function SplitScreenLayout({
  leftPanel,
  rightPanel,
  minWidthPercent = 20,
  initialWidthPercent = 50,
}: SplitScreenLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(initialWidthPercent);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startDragging = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const stopDragging = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onDrag = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || !containerRef.current) return;

    // Throttle style calculations via requestAnimationFrame to ensure fluid 60fps movement
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      const containerRect = containerRef.current!.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

      // Calculate new percentage relative to viewport container width
      const currentX = clientX - containerRect.left;
      let newWidthPercent = (currentX / containerRect.width) * 100;

      // Restrict boundaries to prevent panels from totally collapsing out of sight
      if (newWidthPercent < minWidthPercent) newWidthPercent = minWidthPercent;
      if (newWidthPercent > 100 - minWidthPercent) newWidthPercent = 100 - minWidthPercent;

      setLeftWidth(newWidthPercent);
    });
  }, [isDragging, minWidthPercent]);

  // Handle binding window-level events during drag operations so cursor doesn't lose tracking
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', stopDragging);
      window.addEventListener('touchmove', onDrag);
      window.addEventListener('touchend', stopDragging);
    } else {
      window.removeEventListener('mousemove', onDrag);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchmove', onDrag);
      window.removeEventListener('touchend', stopDragging);
    }

    return () => {
      window.removeEventListener('mousemove', onDrag);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchmove', onDrag);
      window.removeEventListener('touchend', stopDragging);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isDragging, onDrag, stopDragging]);

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${isDragging ? styles.isDragging : ''}`}
    >
      {/* Reader / Left Panel */}
      <div
        className={styles.panel}
        style={{ width: `calc(${leftWidth}% - 4px)` }}
      >
        {leftPanel}
      </div>

      {/* Horizontal Divider Bar */}
      <div
        className={styles.divider}
        onMouseDown={startDragging}
        onTouchStart={startDragging}
        role="separator"
        aria-label="Resize panels divider"
      >
        <div className={styles.dividerGrip} />
      </div>

      {/* Workspace Editor / Right Panel */}
      <div
        className={styles.panel}
        style={{ width: `calc(${100 - leftWidth}% - 4px)` }}
      >
        {rightPanel}
      </div>
    </div>
  );
}
