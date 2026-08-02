'use client';

import { WalletProvider } from '@/contexts/WalletContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { name: 'EVENTS', path: '/devtools/events' },
  { name: 'FEES', path: '/devtools/fees' },
  { name: 'SIMULATOR', path: '/devtools/simulator' },
  { name: 'WALLET', path: '/devtools/wallet' },
  { name: 'STORAGE', path: '/devtools/storage' },
];

export default function DevToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <WalletProvider>
      <div className="min-h-screen bg-black">
        <div className="border-b border-white/10 bg-zinc-950">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex items-center gap-1 pt-4">
              <span className="mr-4 text-xs font-black tracking-widest text-gray-500">
                DEVTOOLS
              </span>
              {tabs.map((tab) => (
                <Link
                  key={tab.path}
                  href={tab.path}
                  className={`rounded-t px-4 py-2 text-xs font-black tracking-widest transition-colors ${
                    pathname === tab.path
                      ? 'border-t border-r border-l border-white/10 bg-black text-red-500'
                      : 'text-gray-500 hover:text-white'
                  }`}
                >
                  {tab.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
        {children}
      </div>
    </WalletProvider>
  );
}
