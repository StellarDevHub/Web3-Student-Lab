'use client';

/**
 * Public Certificate Analytics Explorer — Issue #1179
 *
 * Displays:
 *  - Platform-wide overview stats (total certs, students, courses)
 *  - Student & course leaderboards
 *  - Searchable certificate directory with filters
 *  - Downloadable CSV export button for institutional transparency
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Download, Trophy, BookOpen, Award, Users, TrendingUp, Filter } from 'lucide-react';
import { motion } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExplorerStats {
  totalCertificates: number;
  activeCertificates: number;
  revokedCertificates: number;
  totalStudents: number;
  totalCourses: number;
  certificatesThisMonth: number;
  certificatesThisWeek: number;
  revocationRate: number;
}

interface LeaderboardEntry {
  rank: number;
  studentId: string;
  studentName: string;
  walletAddress: string | null;
  certificateCount: number;
  lastIssuedAt: string;
}

interface CourseLeaderboardEntry {
  rank: number;
  courseId: string;
  courseTitle: string;
  instructor: string;
  certificateCount: number;
  averageGrade: string | null;
}

interface CertificateSearchResult {
  id: string;
  tokenId: string | null;
  studentName: string;
  walletAddress: string | null;
  courseTitle: string;
  instructor: string;
  issuedAt: string;
  status: string;
  grade: string | null;
  metadataUri: string | null;
  network: string | null;
}

interface SearchResponse {
  results: CertificateSearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── API Base ─────────────────────────────────────────────────────────────────

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080/api/v1';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = (await res.json()) as { status: string; data: T };
  return json.data;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    ACTIVE: 'bg-green-900/40 text-green-400 border-green-700/50',
    REVOKED: 'bg-red-900/40 text-red-400 border-red-700/50',
    MINTED: 'bg-blue-900/40 text-blue-400 border-blue-700/50',
    PENDING: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/50',
  };
  const cls = colours[status] ?? 'bg-gray-900/40 text-gray-400 border-gray-700/50';
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2 text-gray-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-3xl font-black text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CertificateExplorerPage() {
  const [stats, setStats] = useState<ExplorerStats | null>(null);
  const [studentLeaderboard, setStudentLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [courseLeaderboard, setCourseLeaderboard] = useState<CourseLeaderboardEntry[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'courses' | 'search'>('overview');
  const [loadingStats, setLoadingStats] = useState(true);

  // ── Load overview stats ───────────────────────────────────────────────

  useEffect(() => {
    setLoadingStats(true);
    Promise.all([
      fetchJson<ExplorerStats>('/certificates/explorer/stats').catch(() => null),
      fetchJson<LeaderboardEntry[]>('/certificates/explorer/leaderboard/students?limit=10').catch(() => []),
      fetchJson<CourseLeaderboardEntry[]>('/certificates/explorer/leaderboard/courses?limit=10').catch(() => []),
    ])
      .then(([s, students, courses]) => {
        if (s) setStats(s);
        setStudentLeaderboard(students ?? []);
        setCourseLeaderboard(courses ?? []);
      })
      .finally(() => setLoadingStats(false));
  }, []);

  // ── Search ────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) {
        // Treat query as wallet/DID/course search
        params.set('courseTitle', searchQuery);
      }
      if (statusFilter) params.set('status', statusFilter);
      params.set('pageSize', '20');

      const data = await fetchJson<SearchResponse>(`/certificates/explorer/search?${params.toString()}`);
      setSearchResults(data);
    } catch {
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, statusFilter]);

  // ── CSV Export ────────────────────────────────────────────────────────

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`${API_BASE}/certificates/explorer/export.csv?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificates-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export failed', err);
    } finally {
      setIsExporting(false);
    }
  }, [statusFilter]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen overflow-hidden bg-black pb-20 text-white">
      {/* Background glows */}
      <div className="pointer-events-none absolute top-0 right-0 h-[700px] w-[700px] rounded-full bg-red-600/5 blur-[150px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-[500px] w-[500px] rounded-full bg-blue-600/5 blur-[120px]" />

      {/* Nav */}
      <nav className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              href="/certificates"
              className="flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Certificates
            </Link>
            <span className="text-xl font-black uppercase tracking-tight">
              Certificate <span className="text-red-500">Explorer</span>
            </span>
          </div>
          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="flex items-center gap-2 rounded-lg border border-green-700/50 bg-green-900/20 px-4 py-1.5 text-sm font-medium text-green-400 transition-colors hover:bg-green-900/40 disabled:opacity-50"
            aria-label="Export certificates as CSV"
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 border-l-4 border-red-600 py-2 pl-6"
        >
          <h1 className="text-4xl font-black uppercase tracking-tight md:text-5xl">
            Academic <span className="text-red-500">Transparency</span> Explorer
          </h1>
          <p className="mt-2 text-gray-400">
            Real-time statistics on certificates issued, popular course tracks, grade distributions, and student milestones.
          </p>
        </motion.div>

        {/* Overview Stats */}
        {!loadingStats && stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          >
            <StatCard icon={Award} label="Total Certificates" value={stats.totalCertificates} sub={`${stats.activeCertificates} active`} />
            <StatCard icon={Users} label="Students" value={stats.totalStudents} />
            <StatCard icon={BookOpen} label="Courses" value={stats.totalCourses} />
            <StatCard
              icon={TrendingUp}
              label="This Month"
              value={stats.certificatesThisMonth}
              sub={`${stats.certificatesThisWeek} this week`}
            />
          </motion.div>
        )}
        {loadingStats && (
          <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border border-white/10 bg-white/5" />
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-2 overflow-x-auto">
          {(['overview', 'students', 'courses', 'search'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {tab === 'overview' ? 'Overview' : tab === 'students' ? 'Student Leaderboard' : tab === 'courses' ? 'Course Leaderboard' : 'Search'}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Top Students */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                  <Trophy className="h-5 w-5 text-yellow-400" />
                  Top Students
                </h2>
                {studentLeaderboard.slice(0, 5).map((entry) => (
                  <div key={entry.studentId} className="flex items-center justify-between border-b border-white/5 py-2 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-bold text-gray-500">#{entry.rank}</span>
                      <span className="text-sm font-medium">{entry.studentName}</span>
                    </div>
                    <span className="text-xs text-red-400 font-bold">{entry.certificateCount} certs</span>
                  </div>
                ))}
              </div>
              {/* Top Courses */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                  <BookOpen className="h-5 w-5 text-blue-400" />
                  Top Courses
                </h2>
                {courseLeaderboard.slice(0, 5).map((entry) => (
                  <div key={entry.courseId} className="flex items-center justify-between border-b border-white/5 py-2 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-bold text-gray-500">#{entry.rank}</span>
                      <div>
                        <p className="text-sm font-medium">{entry.courseTitle}</p>
                        <p className="text-xs text-gray-500">{entry.instructor}</p>
                      </div>
                    </div>
                    <span className="text-xs text-blue-400 font-bold">{entry.certificateCount} issued</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Student Leaderboard Tab */}
        {activeTab === 'students' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10 bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400 hidden sm:table-cell">Wallet</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-400">Certificates</th>
                  </tr>
                </thead>
                <tbody>
                  {studentLeaderboard.map((entry, i) => (
                    <tr key={entry.studentId} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                      <td className="px-4 py-3 font-bold text-gray-500">#{entry.rank}</td>
                      <td className="px-4 py-3 font-medium">{entry.studentName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 hidden sm:table-cell">
                        {entry.walletAddress ? `${entry.walletAddress.slice(0, 8)}…${entry.walletAddress.slice(-4)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-red-400">{entry.certificateCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Course Leaderboard Tab */}
        {activeTab === 'courses' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10 bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400">Course</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400 hidden sm:table-cell">Instructor</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-400">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {courseLeaderboard.map((entry, i) => (
                    <tr key={entry.courseId} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                      <td className="px-4 py-3 font-bold text-gray-500">#{entry.rank}</td>
                      <td className="px-4 py-3 font-medium">{entry.courseTitle}</td>
                      <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{entry.instructor}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-400">{entry.certificateCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Search Bar */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search by course title, student name…"
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50"
                  aria-label="Search certificates"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-8 text-sm text-white outline-none focus:border-red-500/50"
                  aria-label="Filter by status"
                >
                  <option value="" className="bg-gray-900">All Statuses</option>
                  <option value="ACTIVE" className="bg-gray-900">Active</option>
                  <option value="REVOKED" className="bg-gray-900">Revoked</option>
                  <option value="MINTED" className="bg-gray-900">Minted</option>
                  <option value="PENDING" className="bg-gray-900">Pending</option>
                </select>
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {isSearching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {/* Results */}
            {searchResults && (
              <div>
                <p className="mb-3 text-sm text-gray-400">
                  {searchResults.total.toLocaleString()} result{searchResults.total !== 1 ? 's' : ''}
                  {searchResults.totalPages > 1 && ` · Page ${searchResults.page} of ${searchResults.totalPages}`}
                </p>
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="border-b border-white/10 bg-white/5">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400">Student</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Course</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400 hidden lg:table-cell">Grade</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-400 hidden sm:table-cell">Issued</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-400">PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.results.map((cert, i) => (
                        <tr key={cert.id} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{cert.studentName}</p>
                            {cert.walletAddress && (
                              <p className="font-mono text-xs text-gray-500">
                                {cert.walletAddress.slice(0, 6)}…{cert.walletAddress.slice(-4)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-300 hidden md:table-cell">{cert.courseTitle}</td>
                          <td className="px-4 py-3 font-bold text-yellow-400 hidden lg:table-cell">{cert.grade ?? '—'}</td>
                          <td className="px-4 py-3"><StatusBadge status={cert.status} /></td>
                          <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">
                            {new Date(cert.issuedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <a
                              href={`/api/v1/certificates/${cert.id}/download.pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-red-700/50 bg-red-900/20 px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/40"
                              aria-label={`Download PDF for ${cert.studentName}`}
                            >
                              <Download className="h-3 w-3" />
                              PDF
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}
