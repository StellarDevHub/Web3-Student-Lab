'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { useWalletProfileCompletion } from '@/lib/profile-completion';
import { primaryNav } from '@/lib/site-data';
import { useI18n } from '@/i18n';
import { LanguageSelector } from '@/components/common/LanguageSelector';
import NotificationBell from '@/components/notifications/NotificationBell';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileDrawerProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export default function MobileDrawer({ open, setOpen }: MobileDrawerProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { publicKey } = useWallet();
  const completedProfile = useWalletProfileCompletion(publicKey);
  const profileCompleted = !!completedProfile;
  const { t } = useI18n();

  const drawerRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  // Drag tracking state
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const drawerWidth = 300; // Fixed drawer width in pixels

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const getNavLabel = (label: string) => {
    const key = `nav.${label.toLowerCase()}`;
    const translated = t(key);
    return translated === key ? label : translated;
  };

  // Lock body scroll when drawer is open to prevent background scroll bleed-through
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Global Pointer events for swipe-to-open and swipe-to-close gestures
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      // Only handle primary touch/pointer interactions
      if (!e.isPrimary) return;

      const clientX = e.clientX;
      const clientY = e.clientY;

      // 1. Swipe-to-open from left edge (within 40px of screen edge)
      if (!open && clientX < 40) {
        dragStartRef.current = { x: clientX, y: clientY, time: Date.now() };
        isDraggingRef.current = false;
        activePointerIdRef.current = e.pointerId;
        
        // Remove transitions during active dragging
        if (drawerRef.current) drawerRef.current.style.transition = 'none';
        if (backdropRef.current) {
          backdropRef.current.style.transition = 'none';
          backdropRef.current.style.display = 'block';
          backdropRef.current.style.opacity = '0';
        }
      }
      // 2. Swipe-to-close (drag starting inside the open drawer or on the backdrop)
      else if (open) {
        const rect = drawerRef.current?.getBoundingClientRect();
        const clickedInsideDrawer = rect && clientX >= rect.left && clientX <= rect.right;
        const clickedBackdrop = backdropRef.current && e.target === backdropRef.current;

        if (clickedInsideDrawer || clickedBackdrop) {
          dragStartRef.current = { x: clientX, y: clientY, time: Date.now() };
          isDraggingRef.current = false;
          activePointerIdRef.current = e.pointerId;

          if (drawerRef.current) drawerRef.current.style.transition = 'none';
          if (backdropRef.current) backdropRef.current.style.transition = 'none';
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId || !dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Establish drag lock once horizontal drag exceeds threshold and is dominant
      if (!isDraggingRef.current) {
        if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
          isDraggingRef.current = true;
          // Capture pointer so dragging is smooth outside component boundaries
          if (drawerRef.current) {
            try {
              drawerRef.current.setPointerCapture(e.pointerId);
            } catch (err) {}
          }
        } else if (Math.abs(deltaY) > 15) {
          // User is scrolling vertically, cancel swipe tracking
          resetDragState();
          return;
        }
      }

      if (isDraggingRef.current) {
        // Prevent default browser touch scrolling
        if (e.cancelable) e.preventDefault();

        if (!open) {
          // Opening swipe (from -drawerWidth towards 0)
          const tx = Math.max(-drawerWidth, Math.min(0, -drawerWidth + deltaX));
          const opacity = Math.max(0, Math.min(0.6, (tx + drawerWidth) / drawerWidth * 0.6));
          
          if (drawerRef.current) drawerRef.current.style.transform = `translateX(${tx}px)`;
          if (backdropRef.current) backdropRef.current.style.opacity = `${opacity}`;
        } else {
          // Closing swipe (from 0 towards -drawerWidth)
          const tx = Math.max(-drawerWidth, Math.min(0, deltaX));
          const opacity = Math.max(0, Math.min(0.6, (drawerWidth + tx) / drawerWidth * 0.6));
          
          if (drawerRef.current) drawerRef.current.style.transform = `translateX(${tx}px)`;
          if (backdropRef.current) backdropRef.current.style.opacity = `${opacity}`;
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId || !dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const timeDelta = Date.now() - dragStartRef.current.time;
      const velocityX = deltaX / timeDelta; // px/ms

      // Restore spring-like bezier transition
      if (drawerRef.current) {
        drawerRef.current.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1)';
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = 'opacity 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1)';
      }

      if (isDraggingRef.current) {
        // Release pointer capture
        try {
          drawerRef.current?.releasePointerCapture(e.pointerId);
        } catch (err) {}

        if (!open) {
          // Opening: snap open if dragged past 40% or swiped right quickly
          if (deltaX > drawerWidth * 0.4 || velocityX > 0.4) {
            setOpen(true);
            applyVisualState(true);
          } else {
            setOpen(false);
            applyVisualState(false);
          }
        } else {
          // Closing: snap closed if dragged left past 40% or swiped left quickly
          if (deltaX < -drawerWidth * 0.4 || velocityX < -0.4) {
            setOpen(false);
            applyVisualState(false);
          } else {
            setOpen(true);
            applyVisualState(true);
          }
        }
      }

      resetDragState();
    };

    const resetDragState = () => {
      dragStartRef.current = null;
      isDraggingRef.current = false;
      activePointerIdRef.current = null;
    };

    const applyVisualState = (isOpenState: boolean) => {
      if (drawerRef.current) drawerRef.current.style.transform = '';
      if (backdropRef.current) {
        backdropRef.current.style.opacity = '';
        if (!isOpenState) {
          setTimeout(() => {
            if (backdropRef.current && !isDraggingRef.current) {
              backdropRef.current.style.display = 'none';
            }
          }, 400);
        }
      }
    };

    // Attach pointer listeners to window to capture gestures globally
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [open, setOpen]);

  // Synchronize inline style states on manual open state changes
  useEffect(() => {
    if (drawerRef.current) drawerRef.current.style.transform = '';
    if (backdropRef.current) {
      backdropRef.current.style.opacity = '';
      backdropRef.current.style.display = open ? 'block' : 'none';
    }
  }, [open]);

  return (
    <>
      {/* Drawer Backdrop Overlay */}
      <div
        ref={backdropRef}
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 xl:hidden',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={{ display: open ? 'block' : 'none' }}
        aria-hidden="true"
      />

      {/* Slide-out Sidebar Drawer */}
      <div
        ref={drawerRef}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col border-r border-red-500/20 bg-neutral-950 p-6 shadow-[20px_0_50px_rgba(0,0,0,0.8)] transition-transform duration-300 xl:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        role="navigation"
        aria-label="Mobile Navigation"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/30 bg-gradient-to-br from-red-600 to-orange-600 text-xs font-black tracking-widest text-white">
              W3
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-500 font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 animate-pulse" /> {t('nav.open_source_lab')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer Scrollable Navigation Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain py-6 space-y-3">
          {primaryNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'block rounded-2xl px-5 py-4 border transition-all duration-200',
                  active
                    ? 'bg-red-500/10 border-red-500/30 text-white shadow-[0_0_15px_rgba(220,38,38,0.15)]'
                    : 'bg-white/5 border-transparent text-gray-300 hover:bg-white/10 hover:border-white/10'
                )}
              >
                <span className={cn(
                  'block text-[10px] font-black uppercase tracking-[0.2em]',
                  active ? 'text-red-400' : 'text-white'
                )}>
                  {getNavLabel(item.label)}
                </span>
                <span className="mt-1 block text-[10px] font-light text-gray-500 leading-relaxed">
                  {item.description}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Drawer Footer Actions */}
        <div className="border-t border-white/5 pt-6 space-y-4">
          <div className="flex justify-center">
            <LanguageSelector />
          </div>

          <div className="grid grid-cols-1 gap-3">
            {user ? (
              <>
                <Link
                  href="/admin/content"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white text-center hover:bg-white/10 transition-colors"
                >
                  {t('nav.admin')}
                </Link>
                <Link
                  href="/certificates"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white text-center hover:bg-white/10 transition-colors"
                >
                  {t('nav.certificates')}
                </Link>
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
                    {t('nav.notifications')}
                  </span>
                  <NotificationBell />
                </div>
                <button
                  onClick={() => {
                    logout();
                    setOpen(false);
                  }}
                  className="rounded-2xl bg-white/10 px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white hover:bg-white/20 transition-colors"
                >
                  {t('nav.sign_out')}
                </button>
              </>
            ) : (
              <Link
                href={profileCompleted ? '/auth/login' : '/auth/register'}
                onClick={() => setOpen(false)}
                className="group relative inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-4 text-xs font-black uppercase tracking-[0.2em] text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] transition hover:bg-red-500"
              >
                <span>
                  {publicKey
                    ? profileCompleted
                      ? t('nav.open_wallet_access')
                      : t('nav.complete_profile')
                    : t('nav.start_with_wallet')}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
