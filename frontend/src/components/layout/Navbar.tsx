'use client';

import NotificationBell from '@/components/notifications/NotificationBell';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { useWalletProfileCompletion } from '@/lib/profile-completion';
import { primaryNav } from '@/lib/site-data';
import { ArrowRight, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const completedProfile = useWalletProfileCompletion(publicKey);
  const profileCompleted = !!completedProfile;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(10,13,20,0.78)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3" onClick={() => setOpen(false)}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-[linear-gradient(145deg,#ff7849,#d8481f)] text-sm font-black tracking-[0.3em] text-white shadow-[0_16px_40px_rgba(216,72,31,0.28)]">
            W3
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">
              Open Source Lab
            </p>
            <p className="text-base font-semibold tracking-tight text-[var(--text-strong)]">
              Web3 Student Lab
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 lg:flex" aria-label="Primary">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive(item.href)
                  ? 'bg-white text-slate-950'
                  : 'text-[var(--muted)] hover:bg-white/8 hover:text-[var(--text-strong)]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <>
              <NotificationBell />
              <Link
                href="/certificates"
                className="rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-[var(--text-strong)] transition hover:border-[var(--brand)] hover:bg-white/5"
              >
                Certificates
              </Link>
              <button
                onClick={logout}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[var(--brand-soft)]"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="rounded-full px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--text-strong)]"
              >
                {publicKey ? 'Wallet connected' : 'Connect wallet'}
              </Link>
              <Link
                href={profileCompleted ? '/auth/login' : '/auth/register'}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(216,72,31,0.28)] transition hover:translate-y-[-1px] hover:bg-[var(--brand-strong)]"
              >
                {publicKey
                  ? profileCompleted
                    ? 'Open wallet access'
                    : 'Complete profile'
                  : 'Start with wallet'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 text-[var(--text-strong)] lg:hidden"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-[rgba(8,10,16,0.96)] lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 sm:px-6">
            {primaryNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`rounded-2xl px-4 py-3 ${
                  isActive(item.href)
                    ? 'bg-white text-slate-950'
                    : 'bg-white/4 text-[var(--text-strong)]'
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs text-inherit/75">{item.description}</span>
              </Link>
            ))}

            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {user ? (
                <>
                  <Link
                    href="/certificates"
                    onClick={() => setOpen(false)}
                    className="rounded-2xl border border-white/12 px-4 py-3 text-sm font-medium text-[var(--text-strong)]"
                  >
                    Certificates
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      setOpen(false);
                    }}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    onClick={() => setOpen(false)}
                    className="rounded-2xl border border-white/12 px-4 py-3 text-sm font-medium text-[var(--text-strong)]"
                  >
                    {publicKey ? 'Wallet connected' : 'Connect wallet'}
                  </Link>
                  <Link
                    href={profileCompleted ? '/auth/login' : '/auth/register'}
                    onClick={() => setOpen(false)}
                    className="rounded-2xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white"
                  >
                    {publicKey
                      ? profileCompleted
                        ? 'Open wallet access'
                        : 'Complete profile'
                      : 'Start with wallet'}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
