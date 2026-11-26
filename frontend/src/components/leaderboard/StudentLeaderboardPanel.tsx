'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-config';
import VirtualizedLeaderboard, { type LeaderboardColumn } from './VirtualizedLeaderboard';

export interface StudentLeaderboardEntry {
  rank: number;
  studentId: string;
  studentName: string;
  walletAddress: string | null;
  certificateCount: number;
  lastIssuedAt: string;
}

export const studentLeaderboardColumns: LeaderboardColumn<StudentLeaderboardEntry>[] = [
  {
    key: 'rank',
    header: 'Rank',
    className: 'w-12 shrink-0 font-bold text-gray-500',
    headerClassName: 'w-12 shrink-0',
    render: (entry) => `#${entry.rank}`,
  },
  {
    key: 'student',
    header: 'Student',
    className: 'flex-1 font-medium',
    headerClassName: 'flex-1',
    render: (entry) => <span className="block truncate">{entry.studentName}</span>,
  },
  {
    key: 'wallet',
    header: 'Wallet',
    className: 'hidden w-52 shrink-0 font-mono text-xs text-gray-500 sm:block',
    headerClassName: 'hidden w-52 shrink-0 sm:block',
    render: (entry) =>
      entry.walletAddress
        ? `${entry.walletAddress.slice(0, 8)}…${entry.walletAddress.slice(-4)}`
        : '—',
  },
  {
    key: 'certificates',
    header: 'Certificates',
    className: 'w-24 shrink-0 text-right font-bold text-red-400',
    headerClassName: 'w-24 shrink-0 text-right',
    render: (entry) => entry.certificateCount,
  },
];

/**
 * Hackathon student rankings. The public endpoint currently caps at 50 rows,
 * but the list is virtualized so a larger cap (or paged union) cannot flood the
 * mobile DOM.
 */
export default function StudentLeaderboardPanel() {
  const [entries, setEntries] = useState<StudentLeaderboardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}/certificates/explorer/leaderboard/students?limit=50`)
      .then((res) => {
        if (!res.ok) throw new Error(`Leaderboard request failed: ${res.status}`);
        return res.json() as Promise<{ data?: StudentLeaderboardEntry[] }>;
      })
      .then((json) => {
        if (!cancelled) setEntries(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      aria-labelledby="hackathon-leaderboard-heading"
      className="bg-bg-secondary border-border-theme rounded-2xl border p-6"
    >
      <h2
        id="hackathon-leaderboard-heading"
        className="text-foreground mb-1 flex items-center gap-2 text-lg font-black tracking-tight uppercase"
      >
        <Trophy className="h-5 w-5 text-yellow-400" />
        Hackathon <span className="text-red-600">Leaderboard</span>
      </h2>
      <p className="text-text-secondary mb-5 text-sm">
        Student rankings by issued certificates — virtualized so even multi-thousand-entry events
        stay smooth on mobile.
      </p>

      {failed ? (
        <p role="status" className="text-text-secondary py-8 text-center text-sm">
          The leaderboard is unavailable right now. Try again later.
        </p>
      ) : entries === null ? (
        <p role="status" aria-busy="true" className="text-text-secondary py-8 text-center text-sm">
          Loading leaderboard…
        </p>
      ) : (
        <VirtualizedLeaderboard
          rows={entries}
          columns={studentLeaderboardColumns}
          getRowKey={(entry) => entry.studentId}
          ariaLabel="Hackathon student leaderboard"
          rowClassName={(_, index) => (index % 2 === 0 ? '' : 'bg-white/[0.02]')}
        />
      )}
    </section>
  );
}
