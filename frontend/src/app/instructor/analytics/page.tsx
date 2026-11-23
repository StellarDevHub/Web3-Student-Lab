'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, BookOpen, TrendingUp, Award, Clock, GraduationCap, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

interface StudentMetric {
  name: string;
  progress: number;
  engagement: number;
  completed: number;
  lastActive: string;
}

interface CourseMetric {
  courseName: string;
  enrolledStudents: number;
  completionRate: number;
  avgScore: number;
  totalViews: number;
}

const mockStudents: StudentMetric[] = [
  { name: 'Alice Johnson', progress: 85, engagement: 92, completed: 12, lastActive: '2h ago' },
  { name: 'Bob Smith', progress: 62, engagement: 78, completed: 8, lastActive: '1d ago' },
  { name: 'Carol Williams', progress: 45, engagement: 55, completed: 5, lastActive: '3d ago' },
  { name: 'David Brown', progress: 90, engagement: 95, completed: 15, lastActive: '30m ago' },
  { name: 'Eve Davis', progress: 30, engagement: 40, completed: 3, lastActive: '5d ago' },
  { name: 'Frank Miller', progress: 72, engagement: 80, completed: 10, lastActive: '12h ago' },
];

const mockCourses: CourseMetric[] = [
  { courseName: 'Blockchain Fundamentals', enrolledStudents: 45, completionRate: 68, avgScore: 82, totalViews: 1200 },
  { courseName: 'Smart Contract Development', enrolledStudents: 32, completionRate: 55, avgScore: 75, totalViews: 890 },
  { courseName: 'Web3 Frontend', enrolledStudents: 28, completionRate: 72, avgScore: 88, totalViews: 650 },
  { courseName: 'DeFi Protocols', enrolledStudents: 18, completionRate: 45, avgScore: 70, totalViews: 420 },
  { courseName: 'Rust for Blockchain', enrolledStudents: 22, completionRate: 60, avgScore: 78, totalViews: 540 },
];

export default function InstructorAnalyticsPage() {
  const [sortBy, setSortBy] = useState<'progress' | 'engagement'>('progress');

  const averageProgress = useMemo(
    () => Math.round(mockStudents.reduce((sum, s) => sum + s.progress, 0) / mockStudents.length),
    []
  );
  const averageEngagement = useMemo(
    () => Math.round(mockStudents.reduce((sum, s) => sum + s.engagement, 0) / mockStudents.length),
    []
  );
  const totalStudents = mockStudents.length;
  const totalCourses = mockCourses.length;
  const totalCompletions = mockStudents.reduce((sum, s) => sum + s.completed, 0);

  const sortedStudents = useMemo(
    () => [...mockStudents].sort((a, b) => b[sortBy] - a[sortBy]),
    [sortBy]
  );

  return (
    <div className="relative min-h-screen overflow-hidden pb-20">
      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-blue-600/5 blur-[150px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-[600px] w-[600px] rounded-full bg-indigo-600/5 blur-[120px]" />

      <nav className="relative sticky top-0 z-20 border-b border-white/8 bg-[var(--bg-secondary)]/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/analytics"
                className="flex items-center gap-2 text-[var(--muted)] transition-colors hover:text-[var(--text-strong)]"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="text-sm font-bold tracking-widest uppercase">Back</span>
              </Link>
              <span className="flex items-center gap-2 text-2xl font-black tracking-tighter text-[var(--text-strong)] uppercase">
                <BarChart3 className="h-6 w-6 text-blue-500" />
                Instructor <span className="text-blue-500">Analytics</span>
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 border-l-4 border-blue-600 py-2 pl-6"
        >
          <h1 className="mb-3 text-4xl font-black tracking-tight text-[var(--text-strong)] uppercase md:text-5xl">
            Content Creator <span className="text-blue-500">Dashboard</span>
          </h1>
          <p className="text-lg font-light tracking-wide text-[var(--muted)]">
            Track student engagement, content performance, and learning outcomes across your courses.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4"
        >
          {[
            { label: 'Total Students', value: totalStudents, icon: Users, color: 'blue' },
            { label: 'Active Courses', value: totalCourses, icon: BookOpen, color: 'green' },
            { label: 'Avg Progress', value: `${averageProgress}%`, icon: TrendingUp, color: 'orange' },
            { label: 'Engagement Rate', value: `${averageEngagement}%`, icon: Award, color: 'purple' },
          ].map((metric) => {
            const Icon = metric.icon;
            const colorMap: Record<string, string> = {
              blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
              green: 'border-green-500/20 bg-green-500/5 text-green-400',
              orange: 'border-orange-500/20 bg-orange-500/5 text-orange-400',
              purple: 'border-purple-500/20 bg-purple-500/5 text-purple-400',
            };

            return (
              <div
                key={metric.label}
                className="surface-card rounded-2xl border border-white/8 bg-white/4 p-6 transition-all hover:border-blue-500/50"
              >
                <p className="mb-2 text-xs font-bold tracking-widest text-[var(--muted)] uppercase">
                  {metric.label}
                </p>
                <div className="flex items-end justify-between">
                  <p className="font-mono text-3xl font-black text-[var(--text-strong)]">
                    {metric.value}
                  </p>
                  <div className={`rounded-xl border p-2 ${colorMap[metric.color]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>

        <div className="mb-8 grid gap-8 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="surface-card rounded-2xl border border-white/8 bg-white/4 p-6"
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-400" />
                <h2 className="text-lg font-black tracking-widest text-[var(--text-strong)] uppercase">
                  Student Progress
                </h2>
              </div>
              <div className="flex gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
                <button
                  onClick={() => setSortBy('progress')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortBy === 'progress'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
                  }`}
                >
                  Progress
                </button>
                <button
                  onClick={() => setSortBy('engagement')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortBy === 'engagement'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
                  }`}
                >
                  Engagement
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {sortedStudents.map((student, idx) => (
                <div key={student.name} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-400">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-strong)]">{student.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {student.completed} items completed &middot; {student.lastActive}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-bold ${
                        student.progress >= 70
                          ? 'text-green-400'
                          : student.progress >= 40
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }`}
                    >
                      {student.progress}%
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--muted)]">
                        <span>Progress</span>
                        <span>{student.progress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${student.progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--muted)]">
                        <span>Engagement</span>
                        <span>{student.engagement}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all"
                          style={{ width: `${student.engagement}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="surface-card rounded-2xl border border-white/8 bg-white/4 p-6"
          >
            <div className="mb-6 flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-green-400" />
              <h2 className="text-lg font-black tracking-widest text-[var(--text-strong)] uppercase">
                Course Performance
              </h2>
            </div>

            <div className="space-y-4">
              {mockCourses.map((course) => (
                <div key={course.courseName} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-strong)]">
                        {course.courseName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {course.enrolledStudents} enrolled
                      </p>
                    </div>
                    <span className="rounded-full bg-green-500/10 px-2.5 py-0.5 text-[10px] font-medium text-green-400">
                      {course.completionRate}% completion
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl border border-white/8 bg-white/4 p-2">
                      <p className="text-xs font-bold text-[var(--text-strong)]">{course.avgScore}</p>
                      <p className="text-[10px] text-[var(--muted)]">Avg Score</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/4 p-2">
                      <p className="text-xs font-bold text-[var(--text-strong)]">{course.totalViews}</p>
                      <p className="text-[10px] text-[var(--muted)]">Total Views</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/4 p-2">
                      <p className="text-xs font-bold text-[var(--text-strong)]">
                        {Math.round(course.enrolledStudents * (course.completionRate / 100))}
                      </p>
                      <p className="text-[10px] text-[var(--muted)]">Completed</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="surface-card rounded-2xl border border-white/8 bg-white/4 p-6"
        >
          <div className="mb-6 flex items-center gap-3">
            <Award className="h-5 w-5 text-yellow-400" />
            <h2 className="text-lg font-black tracking-widest text-[var(--text-strong)] uppercase">
              Learning Outcomes Summary
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[
              {
                label: 'Total Completions',
                value: totalCompletions,
                sub: `${Math.round(totalCompletions / totalStudents)} per student`,
                icon: GraduationCap,
                color: 'green',
              },
              {
                label: 'Avg Score Across Courses',
                value: Math.round(mockCourses.reduce((s, c) => s + c.avgScore, 0) / mockCourses.length),
                sub: 'out of 100',
                icon: TrendingUp,
                color: 'blue',
              },
              {
                label: 'Overall Completion Rate',
                value: Math.round(mockCourses.reduce((s, c) => s + c.completionRate, 0) / mockCourses.length),
                sub: '% across all courses',
                icon: Award,
                color: 'purple',
              },
              {
                label: 'Total Content Views',
                value: mockCourses.reduce((s, c) => s + c.totalViews, 0),
                sub: 'page views',
                icon: BarChart3,
                color: 'orange',
              },
            ].map((stat) => {
              const Icon = stat.icon;
              const colorMap: Record<string, string> = {
                green: 'text-green-400 bg-green-500/10',
                blue: 'text-blue-400 bg-blue-500/10',
                purple: 'text-purple-400 bg-purple-500/10',
                orange: 'text-orange-400 bg-orange-500/10',
              };

              return (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/8 bg-white/4 p-5 transition-all hover:border-white/15"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold tracking-widest text-[var(--muted)] uppercase">
                      {stat.label}
                    </p>
                    <div className={`rounded-lg p-1.5 ${colorMap[stat.color]}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <p className="font-mono text-2xl font-black text-[var(--text-strong)]">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{stat.sub}</p>
                </div>
              );
            })}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
