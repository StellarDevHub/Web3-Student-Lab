'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './SplitScreenLayout.module.css';

interface SplitScreenLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  minWidthPercent?: number;
  initialWidthPercent?: number;
  storageKey?: string;
}

export default function SplitScreenLayout({
  leftPanel,
  rightPanel,
  minWidthPercent = 20,
  initialWidthPercent = 50,
  storageKey = 'split-screen-layout',
}: SplitScreenLayoutProps) {
  // Persist pane sizing across page reloads (Acceptance Criteria: persists sizing across reloads)
  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window === 'undefined') return initialWidthPercent;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!Number.isNaN(parsed)) return parsed;
      }
    } catch {
      // localStorage may be unavailable; fall back to default
    }
    return initialWidthPercent;
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

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

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      const containerRect = containerRef.current!.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

      const currentX = clientX - containerRect.left;
      let newWidthPercent = (currentX / containerRect.width) * 100;

      if (newWidthPercent < minWidthPercent) newWidthPercent = minWidthPercent;
      if (newWidthPercent > 100 - minWidthPercent) newWidthPercent = 100 - minWidthPercent;

      setLeftWidth(newWidthPercent);
      // Persist to localStorage so sizing survives reloads
      try {
        window.localStorage.setItem(storageKey, String(newWidthPercent));
      } catch {
        // ignore
      }
    });
  }, [isDragging, minWidthPercent, storageKey]);

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

  // Close mobile drawer when resizing to a desktop breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = () => setIsMobileDrawerOpen(false);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${isDragging ? styles.isDragging : ''}`}
    >
      {/* Mobile sidebar hamburger drawer trigger (Easy sub-task) */}
      {isMobile && (
        <button
          className={styles.mobileDrawerToggle}
          onClick={() => setIsMobileDrawerOpen((prev) => !prev)}
          aria-label={isMobileDrawerOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
          aria-expanded={isMobileDrawerOpen}
        >
          <span className={styles.hamburgerLine} />
          <span className={styles.hamburgerLine} />
          <span className={styles.hamburgerLine} />
        </button>
      )}

      {/* Mobile drawer panel */}
      {isMobile && isMobileDrawerOpen && (
        <div
          className={styles.mobileDrawerOverlay}
          onClick={() => setIsMobileDrawerOpen(false)}
        >
          <div className={styles.mobileDrawerPanel} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.mobileDrawerClose}
              onClick={() => setIsMobileDrawerOpen(false)}
              aria-label="Close drawer"
            >
              ✕
            </button>
            {leftPanel}
          </div>
        </div>
      )}

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
