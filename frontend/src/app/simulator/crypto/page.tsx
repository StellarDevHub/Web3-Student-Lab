'use client';

import { Book, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { CryptoVisualizer } from '@/components/simulator/CryptoVisualizer';

export default function SimulatorCryptoPage() {
  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-y-auto bg-black p-6 font-mono text-white md:p-12">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>

      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-2 text-[11px]">
            <li>
              <Link
                href="/simulator"
                className="text-gray-500 transition-colors hover:text-white"
              >
                Simulator
              </Link>
            </li>
            <li>
              <ChevronRight className="h-3 w-3 text-gray-600" aria-hidden="true" />
            </li>
            <li className="text-red-500" aria-current="page">
              Cryptography Visualizer
            </li>
          </ol>
        </nav>

        {/* Header */}
        <div className="mb-8 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="border-l-4 border-red-600 pl-6">
            <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
              Cryptography <span className="text-red-500">Visualizer</span>
            </h1>
            <p className="text-xs tracking-[0.3em] text-gray-500 uppercase">
              Interactive Cryptographic Operations Lab
            </p>
          </div>
          <Link
            href="/roadmap"
            className="flex items-center gap-2 rounded border border-red-600/30 bg-red-600/10 px-4 py-2 text-[10px] font-black tracking-widest text-red-500 uppercase transition-colors hover:bg-red-600/20"
          >
            <Book className="h-3.5 w-3.5" aria-hidden="true" />
            View Learning Path
          </Link>
        </div>

        {/* Visualizer */}
        <div className="h-auto flex-grow lg:h-[calc(100vh-280px)]">
          <CryptoVisualizer />
        </div>
      </div>
    </div>
  );
}
