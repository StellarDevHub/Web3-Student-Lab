'use client';

import { analyticsAPI } from '@/lib/api';
import { learnerPillars, spotlightTools } from '@/lib/site-data';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type LandingStats = {
  courses: number;
  students: number;
  credentials: number;
};

const defaultStats: LandingStats = {
  courses: 12,
  students: 1250,
  credentials: 450,
};

export default function HomePage() {
  const [stats, setStats] = useState<LandingStats>(defaultStats);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = (await analyticsAPI.getGlobalStats()) as any;
        const summary = data?.summary || [];
        const studentStat = summary.find((item: any) => item.metricType === 'USER_STAT');
        const enrollmentStat = summary.find((item: any) => item.metricType === 'ENROLLMENT_STAT');
        const courseStat = summary.find((item: any) => item.metricType === 'COURSE_STAT');

        if (!mounted) return;
        setStats({
          courses: courseStat?._count?._all || defaultStats.courses,
          students: studentStat?._count?._all || defaultStats.students,
          credentials: enrollmentStat?._count?._all || defaultStats.credentials,
        });
      } catch {
        if (mounted) setStats(defaultStats);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <section className="grid gap-12 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
        <div className="space-y-8">
          <span className="eyebrow">Open-source blockchain education</span>
          <div className="space-y-5">
            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-6xl lg:text-7xl">
              Learn blockchain, smart contracts, and hackathon building in one place.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
              Web3 Student Lab helps beginners and university students move from curiosity to
              shipped projects with guided modules, practical tools, and verifiable outcomes.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href="/courses"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--brand)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_20px_40px_rgba(216,72,31,0.22)] transition hover:translate-y-[-1px] hover:bg-[var(--brand-strong)]"
            >
              Explore learning modules
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/verify"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 px-6 py-3.5 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-white/5"
            >
              Verify credentials
              <CheckCircle2 className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Modules', value: stats.courses },
              { label: 'Learners', value: stats.students },
              { label: 'Credential records', value: stats.credentials },
            ].map((item) => (
              <div key={item.label} className="surface-card p-5">
                <p className="text-3xl font-semibold text-[var(--text-strong)]">{item.value}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card relative overflow-hidden p-8 lg:p-10">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-bl-[3rem] bg-[radial-gradient(circle,rgba(240,100,45,0.25),transparent_72%)]" />
          <div className="relative space-y-8">
            <div className="flex items-center gap-3 text-sm font-medium text-[var(--text-strong)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/7">
                <Sparkles className="h-5 w-5 text-[var(--brand-strong)]" />
              </div>
              <div>
                <p>What makes this platform useful</p>
                <p className="text-xs text-[var(--muted)]">
                  A tighter path from learning to building.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {learnerPillars.map((pillar) => (
                <div
                  key={pillar.title}
                  className="rounded-2xl border border-white/8 bg-white/4 p-5"
                >
                  <h2 className="text-lg font-semibold text-[var(--text-strong)]">
                    {pillar.title}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{pillar.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="eyebrow">Core experiences</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-strong)]">
              The pages learners should actually use
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-[var(--muted)]">
            This rebuild trims the clutter and puts the highest-value tools first so students can
            navigate the platform without hunting through half-working links.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {spotlightTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className="surface-card group flex h-full flex-col justify-between p-6 transition hover:translate-y-[-2px] hover:border-[rgba(240,100,45,0.35)]"
              >
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/6 text-[var(--brand-strong)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-[var(--text-strong)]">
                    {tool.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{tool.summary}</p>
                </div>
                <div className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-[var(--text-strong)]">
                  Open page
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
