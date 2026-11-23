'use client';

import { useAuth } from '@/contexts/AuthContext';
import Dashboard from '@/components/analytics/Dashboard';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AnalyticsPage() {
  const { user } = useAuth();

  return (
    <div className="bg-background text-foreground relative min-h-screen overflow-hidden pb-20 transition-colors duration-200">
      {/* Background glows */}
      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-red-600/5 blur-[150px]"></div>
      <div className="pointer-events-none absolute bottom-0 left-0 h-[600px] w-[600px] rounded-full bg-red-600/5 blur-[120px]"></div>

      {/* Navigation */}
      <nav className="bg-bg-secondary/80 border-border-theme relative sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-text-secondary hover:text-foreground flex items-center gap-2 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="text-sm font-bold tracking-widest uppercase">Back</span>
              </Link>
              <span className="text-foreground flex items-center gap-2 text-2xl font-black tracking-tighter uppercase">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500"></span>
                Analytics <span className="text-red-600">Hub</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden flex-col items-end md:flex">
                <span className="text-text-secondary text-xs font-bold tracking-widest uppercase">
                  Active Operator
                </span>
                <span className="text-foreground font-mono text-sm">
                  {user?.name || 'Unknown Entity'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 border-l-4 border-red-600 py-2 pl-6"
        >
          <h1 className="text-foreground mb-3 text-4xl font-black tracking-tight uppercase md:text-5xl">
            Advanced <span className="text-red-600">Analytics</span>
          </h1>
          <p className="text-text-secondary text-lg font-light tracking-wide">
            Deep insights into your learning patterns, progress, and performance metrics.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Dashboard />
        </motion.div>
      </main>
    </div>
  );
}
