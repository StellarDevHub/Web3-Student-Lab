'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import VulnerabilityScannerPanel from '@/components/simulator/VulnerabilityScannerPanel';

export default function VulnerabilityScannerPage() {
  return (
    <div className="bg-background text-foreground min-h-screen pb-20">
      <nav className="bg-bg-secondary/80 border-border-theme sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-4 px-4">
          <Link href="/simulator" className="text-text-secondary flex items-center gap-2 text-sm font-bold uppercase">
            <ArrowLeft className="h-5 w-5" /> Simulator
          </Link>
          <span className="text-2xl font-black uppercase">Security <span className="text-red-600">Scanner</span></span>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-12">
        <p className="text-text-secondary mb-8 max-w-2xl text-lg">
          Scan Soroban contract snippets for common vulnerability patterns in the learning simulator.
        </p>
        <VulnerabilityScannerPanel />
      </main>
    </div>
  );
}
