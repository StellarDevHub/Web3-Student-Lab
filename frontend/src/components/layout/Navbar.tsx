"use client";

import { LanguageSelector } from "@/components/common/LanguageSelector";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { usePrefetch } from "@/hooks/usePrefetch";
import { NotificationBell } from "../notifications/NotificationBell";

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { handleMouseEnter, handleMouseLeave } = usePrefetch();

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const navLinks = [
    { name: t("nav.modules"), path: "/courses" },
    { name: t("nav.roadmap"), path: "/roadmap" },
    { name: t("nav.quiz"), path: "/quiz" },
    { name: t("nav.playground"), path: "/playground" },
    { name: t("nav.reviews"), path: "/peer-review" },
    { name: t("nav.simulator"), path: "/simulator" },
    { name: t("nav.ideas"), path: "/ideas" },
    { name: t("nav.verify"), path: "/verify" },
    { name: t("nav.subscriptions"), path: "/subscriptions" },
    { name: t("nav.notarization"), path: "/notarization" },
    { name: t("nav.devtools"), path: "/devtools/events" },
  ];

  return (
    <nav
      className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 backdrop-blur-md"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 group" aria-label="Web3 Lab - Go to homepage">
              <div
                className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center transform group-hover:rotate-12 transition-transform duration-300 shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                aria-hidden="true"
              >
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <span className="text-2xl font-black text-white tracking-widest uppercase">
                Web3 <span className="text-red-600">Lab</span>
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden xl:flex items-center gap-6" role="menubar" aria-label="Site navigation">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                role="menuitem"
                onMouseEnter={() => handleMouseEnter(link.path)}
                onMouseLeave={handleMouseLeave}
                aria-current={isActive(link.path) ? "page" : undefined}
                className={`text-[10px] font-black tracking-[0.2em] transition-colors uppercase ${
                  isActive(link.path)
                    ? "text-red-500"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <LanguageSelector />
            {user ? (
              <div className="flex items-center gap-4">
                <Link
                  href="/dashboard"
                  onMouseEnter={() => handleMouseEnter("/dashboard")}
                  onMouseLeave={handleMouseLeave}
                  aria-current={isActive("/dashboard") ? "page" : undefined}
                  className={`text-[10px] font-black tracking-[0.2em] px-4 py-2 border rounded transition-all uppercase ${
                    isActive("/dashboard")
                      ? "bg-red-600 border-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                      : "border-white/10 text-gray-400 hover:text-white hover:border-red-500/50"
                  }`}
                >
                  DASHBOARD
                </Link>
                <Link
                  href="/certificates"
                  onMouseEnter={() => handleMouseEnter("/certificates")}
                  onMouseLeave={handleMouseLeave}
                  aria-current={isActive("/certificates") ? "page" : undefined}
                  className={`text-[10px] font-black tracking-[0.2em] px-4 py-2 border rounded transition-all uppercase ${
                    isActive("/certificates")
                      ? "bg-red-600 border-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                      : "border-white/10 text-gray-400 hover:text-white hover:border-red-500/50"
                  }`}
                >
                  VAULT
                </Link>
                <NotificationBell />
                <button
                  onClick={logout}
                  aria-label="Logout from your account"
                  className="w-10 h-10 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center hover:border-red-500/50 transition-colors group"
                >
                  <svg
                    className="w-5 h-5 text-gray-500 group-hover:text-red-500 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <Link
                  href="/auth/login"
                  className="text-[10px] font-black tracking-[0.2em] text-gray-400 hover:text-white transition-colors uppercase"
                >
                  SIGN IN
                </Link>
                <Link
                  href="/auth/register"
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black tracking-[0.2em] rounded border border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.4)] hover:shadow-[0_0_25px_rgba(220,38,38,0.6)] transition-all uppercase"
                >
                  INITIALIZE
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="xl:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              className="text-gray-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
            >
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                {isMobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Panel */}
      {isMobileMenuOpen && (
        <div
          id="mobile-menu"
          className="xl:hidden bg-black border-b border-white/10 px-4 pt-2 pb-6 space-y-2 shadow-2xl"
          role="menu"
          aria-label="Mobile navigation"
        >
          {navLinks.map((link) => (
            <Link
              key={link.path}
              href={link.path}
              role="menuitem"
              aria-current={isActive(link.path) ? "page" : undefined}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`block px-3 py-3 text-sm font-black tracking-widest uppercase rounded-md transition-colors ${
                isActive(link.path)
                  ? "bg-red-500/10 text-red-500"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {link.name}
            </Link>
          ))}
          <div className="h-px w-full bg-white/10 my-2" role="separator"></div>
          {user ? (
            <>
              <Link
                href="/dashboard"
                role="menuitem"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-3 text-sm font-black tracking-widest text-white uppercase bg-red-600 rounded-md"
              >
                Dashboard
              </Link>
              <button
                onClick={() => {
                  logout();
                  setIsMobileMenuOpen(false);
                }}
                role="menuitem"
                className="block w-full text-left px-3 py-3 text-sm font-black tracking-widest text-red-500 uppercase hover:bg-red-500/10 rounded-md"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                role="menuitem"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-3 text-sm font-black tracking-widest text-gray-400 hover:text-white uppercase"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register"
                role="menuitem"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-3 text-sm font-black tracking-widest text-red-500 hover:text-red-400 uppercase"
              >
                Initialize
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
