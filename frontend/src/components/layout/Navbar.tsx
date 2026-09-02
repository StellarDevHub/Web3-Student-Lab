'use client';

import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { LanguageSelector } from '@/components/common/LanguageSelector';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useWallet } from '@/contexts/WalletContext';
import { useWalletProfileCompletion } from '@/lib/profile-completion';
import { primaryNav } from '@/lib/site-data';
import { ArrowRight, Menu, X, Sparkles, ChevronDown, LogOut } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useKeyboardShortcuts } from '@/components/keyboard/KeyboardShortcutsProvider';
import MobileDrawer from './MobileDrawer';

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const completedProfile = useWalletProfileCompletion(publicKey);
  const profileCompleted = !!completedProfile;
  const { openShortcutHelp } = useKeyboardShortcuts();
  const { t } = useI18n();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const getNavLabel = (label: string) => {
    const key = `nav.${label.toLowerCase()}`;
    const translated = t(key);
    return translated === key ? label : translated;
  };

  return (
    <header suppressHydrationWarning className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-black/80 border-b border-red-500/20 backdrop-blur-xl shadow-[0_10px_30px_rgba(220,38,38,0.1)]' : 'bg-transparent border-b border-white/5'}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 w-full px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex shrink-0">
          <Link href="/" className="group flex items-center gap-4" onClick={() => setOpen(false)}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-600 to-orange-600 text-sm font-black tracking-[0.3em] text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] group-hover:scale-105 transition-transform group-hover:shadow-[0_0_30px_rgba(220,38,38,0.6)] relative overflow-hidden">
              <div className="absolute inset-0 bg-white/20 translate-y-full transition-transform group-hover:translate-y-0" />
              <span className="relative z-10">W3</span>
            </div>
            <div className="hidden sm:block">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-500 font-bold group-hover:text-red-400 transition-colors flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> {t('nav.open_source_lab')}
              </p>
              <p className="text-sm font-black tracking-widest text-white uppercase mt-0.5">
                {t('nav.web3_student_lab')}
              </p>
            </div>
          </Link>
        </div>

        <div className="flex flex-1 justify-end items-center gap-6">
          <nav className="hidden items-center gap-2 xl:flex relative z-[100]" aria-label="Primary">
            <Link
              href="/courses"
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors rounded-xl ${
                isActive('/courses')
                  ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              {t('nav.learn')}
            </Link>
            <Link
              href="/admin/courses"
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors rounded-xl ${
                isActive('/admin/courses') || isActive('/admin/content')
                  ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              {t('nav.admin')}
            </Link>
            <div className="group relative">
              <button className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 hover:text-white transition-colors">
                Explore <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-72 rounded-2xl border border-red-500/20 bg-black/95 backdrop-blur-xl shadow-[0_20px_40px_rgba(220,38,38,0.2)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <div className="p-3 flex flex-col gap-1">
                  {primaryNav.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block px-4 py-3 rounded-xl transition-all border border-transparent ${active ? 'bg-red-500/10 border-red-500/20' : 'hover:bg-white/5 hover:border-white/10'}`}
                      >
                        <div className={`text-xs font-black uppercase tracking-widest mb-1 ${active ? 'text-white' : 'text-gray-300'}`}>{getNavLabel(item.label)}</div>
                        <div className="text-[10px] text-gray-500 normal-case tracking-normal font-normal leading-relaxed">{item.description}</div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </nav>

          <div className="hidden items-center gap-6 xl:flex">
            <LanguageSelector />
            {user ? (
              <>
                <NotificationBell />
                <Link
                  href="/admin/content"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/50 transition-all shadow-[0_0_15px_rgba(220,38,38,0.15)] hover:shadow-[0_0_25px_rgba(220,38,38,0.25)]"
                >
                  {t('nav.admin')}
                </Link>
                <Link
                  href="/certificates"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/50 transition-all shadow-[0_0_15px_rgba(220,38,38,0.15)] hover:shadow-[0_0_25px_rgba(220,38,38,0.25)]"
                >
                  {t('nav.certificates')}
                </Link>
                <button
                  onClick={logout}
                  title={t('nav.sign_out')}
                  aria-label={t('nav.sign_out')}
                  className="flex h-10 w-10 items-center justify-center rounded-full transition-colors text-gray-400 hover:bg-white/5 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Link
                  href={profileCompleted ? '/auth/login' : '/auth/register'}
                  className="group relative inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-xs font-black uppercase tracking-[0.15em] text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(220,38,38,0.5)] overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full transition-transform group-hover:translate-y-0" />
                  <span className="relative z-10 flex items-center gap-2">
                    {publicKey
                      ? profileCompleted
                        ? t('nav.open_wallet_access')
                        : t('nav.complete_profile')
                      : t('nav.start_with_wallet')}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </>
            )}
          </div>


          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 text-white xl:hidden bg-white/5 hover:bg-white/10 transition-colors"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <MobileDrawer open={open} setOpen={setOpen} />
    </header>
  );
}
