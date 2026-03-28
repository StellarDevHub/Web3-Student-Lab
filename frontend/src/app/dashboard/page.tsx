'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Certificate, certificatesAPI, Course, coursesAPI, enrollmentsAPI } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCourses: 0,
    enrolledCourses: 0,
    completedCourses: 0,
    certificates: 0,
  });

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [coursesData, certificatesData, enrollmentsData] = await Promise.all([
          coursesAPI.getAll(),
          user ? certificatesAPI.getByStudentId(user.id) : Promise.resolve([]),
          user ? enrollmentsAPI.getByStudentId(user.id) : Promise.resolve([]),
        ]);

        setCourses(coursesData);
        setCertificates(certificatesData);

        setStats({
          totalCourses: coursesData.length,
          enrolledCourses: enrollmentsData.length,
          completedCourses: certificatesData.length,
          certificates: certificatesData.length,
        });
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black pb-20 text-white selection:bg-red-600 selection:text-white">
      {/* Abstract Background Glow */}
      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-red-600/5 blur-[150px]"></div>
      <div className="pointer-events-none absolute bottom-0 left-0 h-[600px] w-[600px] rounded-full bg-red-600/5 blur-[120px]"></div>

      {/* Navigation Layer */}
      <nav className="relative sticky top-0 z-20 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 justify-between">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="flex items-center gap-2 text-2xl font-black tracking-tighter text-white uppercase">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500"></span>
                  Control <span className="text-red-600">Center</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden flex-col items-end md:flex">
                <span className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                  Active Operator
                </span>
                <span className="font-mono text-sm text-gray-300">
                  {user?.name || 'Unknown Entity'}
                </span>
              </div>
              <button
                onClick={logout}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-xs font-bold tracking-widest text-red-500 uppercase transition-all hover:bg-red-500 hover:text-white"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="mb-12 border-l-4 border-red-600 py-2 pl-6">
          <h2 className="mb-3 text-4xl font-black tracking-tight text-white uppercase md:text-5xl">
            Terminal <span className="text-gray-500">Access Granted</span>
          </h2>
          <p className="text-lg font-light tracking-wide text-gray-400">
            Operator{' '}
            <span className="font-mono text-white">{user?.name?.split(' ')[0] || 'Student'}</span> —
            Metrics and module connections active.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-6 transition-all hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(220,38,38,0.1)]">
            <div className="absolute top-0 right-0 h-16 w-16 rounded-bl-3xl bg-white/5 transition-colors group-hover:bg-red-500/10"></div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black transition-colors group-hover:border-white/30">
                <svg
                  className="h-6 w-6 text-white group-hover:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <p className="font-mono text-3xl font-black text-white">{stats.totalCourses}</p>
            </div>
            <p className="mt-2 text-xs font-bold tracking-widest text-gray-500 uppercase">
              Available Nodes
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-6 transition-all hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(220,38,38,0.1)]">
            <div className="absolute top-0 right-0 h-16 w-16 rounded-bl-3xl bg-white/5 transition-colors group-hover:bg-red-500/10"></div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black transition-colors group-hover:border-white/30">
                <svg
                  className="h-6 w-6 text-white group-hover:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="font-mono text-3xl font-black text-white">{stats.enrolledCourses}</p>
            </div>
            <p className="mt-2 text-xs font-bold tracking-widest text-gray-500 uppercase">
              Active Uplinks
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-6 transition-all hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(220,38,38,0.1)]">
            <div className="absolute top-0 right-0 h-16 w-16 rounded-bl-3xl bg-white/5 transition-colors group-hover:bg-red-500/10"></div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black transition-colors group-hover:border-white/30">
                <svg
                  className="h-6 w-6 text-white group-hover:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                  />
                </svg>
              </div>
              <p className="font-mono text-3xl font-black text-white">{stats.completedCourses}</p>
            </div>
            <p className="mt-2 text-xs font-bold tracking-widest text-gray-500 uppercase">
              Executed Modules
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-6 transition-all hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(220,38,38,0.1)]">
            <div className="absolute top-0 right-0 h-16 w-16 rounded-bl-3xl bg-white/5 transition-colors group-hover:bg-red-500/10"></div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black transition-colors group-hover:border-white/30">
                <svg
                  className="h-6 w-6 text-white group-hover:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
              </div>
              <p className="font-mono text-3xl font-black text-white">{stats.certificates}</p>
            </div>
            <p className="mt-2 text-xs font-bold tracking-widest text-gray-500 uppercase">
              Cryptographic Tokens
            </p>
          </div>
        </div>

        {/* Recent Courses */}
        <div className="mb-16">
          <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-4">
            <h3 className="flex items-center gap-3 text-xl font-black tracking-widest text-white uppercase">
              <span className="inline-block h-4 w-4 rounded-sm bg-red-600"></span> Directory Nodes
            </h3>
            <Link
              href="/courses"
              className="group flex items-center gap-1 text-xs font-bold tracking-widest text-gray-400 uppercase transition-colors hover:text-white"
            >
              Scan All{' '}
              <span className="transform transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {courses.slice(0, 3).map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="group relative block border border-white/5 bg-zinc-950 p-8 transition-all hover:border-red-500/30 hover:bg-zinc-900"
              >
                <div className="absolute top-0 bottom-0 left-0 w-1 bg-transparent transition-colors group-hover:bg-red-600"></div>
                <h4 className="mb-3 text-xl font-black tracking-tight text-white uppercase group-hover:text-red-50">
                  {course.title}
                </h4>
                <p className="mb-6 line-clamp-2 text-sm font-light text-gray-400">
                  {course.description || 'System metadata missing'}
                </p>
                <div className="flex items-center justify-between border-t border-white/5 pt-6">
                  <span className="rounded border border-white/10 bg-black px-2 py-1 font-mono text-xs text-gray-500">
                    {course.credits} UNIT
                  </span>
                  <span className="text-xs font-bold tracking-widest text-red-500 uppercase group-hover:text-red-400">
                    Connect
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* My Certificates */}
        {certificates.length > 0 && (
          <div>
            <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="flex items-center gap-3 text-xl font-black tracking-widest text-white uppercase">
                <span className="inline-block h-4 w-4 rounded-sm bg-red-600"></span> Issued
                Credentials
              </h3>
              <Link
                href="/certificates"
                className="group flex items-center gap-1 text-xs font-bold tracking-widest text-gray-400 uppercase transition-colors hover:text-white"
              >
                Vault{' '}
                <span className="transform transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {certificates.slice(0, 3).map((cert) => (
                <Link
                  key={cert.id}
                  href={`/certificates/${cert.id}`}
                  className="group relative block overflow-hidden rounded-xl border border-red-500/20 bg-black p-8 shadow-[0_0_20px_rgba(220,38,38,0.05)] transition-all hover:border-red-500/60 hover:shadow-[0_0_30px_rgba(220,38,38,0.2)]"
                >
                  <div className="pointer-events-none absolute top-0 right-0 h-32 w-32 rounded-bl-full bg-red-900/10 transition-colors group-hover:bg-red-900/20"></div>
                  <div className="relative z-10 mb-6 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/30 bg-zinc-950">
                      <svg
                        className="h-6 w-6 text-red-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                        />
                      </svg>
                    </div>
                    <span className="rounded border border-white/10 bg-zinc-950 px-3 py-1 font-mono text-xs text-gray-400">
                      {new Date(cert.issuedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="mb-2 text-xl font-bold tracking-wide text-white uppercase group-hover:text-red-100">
                    {cert.course?.title || 'Soroban Protocol'}
                  </h4>
                  <p className="text-sm font-light text-red-500/80">On-Chain Certification</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
