'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import GasCalculatorPanel from '@/components/open-source/GasCalculatorPanel';

export default function GasCalculatorPage() {
  return (
    <div className="bg-background text-foreground min-h-screen pb-20">
      <nav className="bg-bg-secondary/80 border-border-theme sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-4 px-4">
          <Link href="/version-control" className="text-text-secondary flex items-center gap-2 text-sm font-bold uppercase">
            <ArrowLeft className="h-5 w-5" /> OSCT
          </Link>
          <span className="text-2xl font-black uppercase">Gas <span className="text-red-600">Calculator</span></span>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-12">
        <p className="text-text-secondary mb-8 max-w-2xl text-lg">
          Estimate Soroban gas before opening a PR — compare optimization strategies against contribution budgets.
        </p>
        <GasCalculatorPanel />
      </main>
    </div>
  );
}
