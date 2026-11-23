'use client';

import React from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

export function DashboardSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Skeleton className="mb-4 h-8 w-40" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-6 w-full max-w-2xl" />
          <Skeleton className="h-12 w-44" />
        </div>
        <div className="surface-card overflow-hidden p-6 sm:p-8">
          <Skeleton className="mb-3 h-4 w-32" />
          <Skeleton className="mb-3 h-8 w-56" />
          <Skeleton className="mb-6 h-5 w-full max-w-md" />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <Skeleton className="mb-3 h-10 w-10" borderRadius="1rem" />
                <Skeleton className="mb-1 h-8 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="mt-10 surface-card p-8 sm:p-10">
        <Skeleton className="mb-3 h-8 w-64" />
        <Skeleton className="mb-4 h-5 w-full max-w-xl" />
        <Skeleton className="h-12 w-40" />
      </div>
    </div>
  );
}

export function CourseListSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading courses"
    >
      <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Skeleton className="mb-4 h-8 w-40" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-6 w-full max-w-xl" />
          <Skeleton className="h-24 w-full" borderRadius="1.5rem" />
        </div>
        <div className="surface-card p-6 sm:p-8">
          <Skeleton className="mb-3 h-5 w-32" />
          <Skeleton className="h-12 w-full" borderRadius="1rem" />
          <Skeleton className="mt-3 h-5 w-48" />
        </div>
      </section>
      <section className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="surface-card p-6">
            <Skeleton className="mb-4 h-12 w-12" borderRadius="1rem" />
            <Skeleton className="mb-3 h-6 w-3/4" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-2 h-4 w-5/6" />
            <div className="mt-8 flex items-center justify-between border-t border-white/8 pt-5">
              <div>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-1 h-4 w-24" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export function CourseDetailSkeleton() {
  return (
    <div
      className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black pb-20 text-white"
      aria-busy="true"
      aria-label="Loading course details"
    >
      <div className="relative z-10 border-b border-white/10 bg-zinc-950/80">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Skeleton className="mb-8 h-4 w-40" />
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="w-full">
              <Skeleton className="mb-4 h-6 w-48" borderRadius="9999px" />
              <Skeleton className="mb-4 h-12 w-3/4" />
              <Skeleton className="mb-2 h-5 w-full max-w-3xl" />
              <Skeleton className="h-5 w-2/3 max-w-2xl" />
              <div className="mt-4 flex flex-wrap gap-6">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-5 w-40" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-8">
              <Skeleton className="mb-6 h-8 w-56" />
              <Skeleton className="mb-2 h-5 w-full" />
              <Skeleton className="mb-2 h-5 w-5/6" />
              <Skeleton className="mb-8 h-5 w-4/6" />
              <div className="border-t border-white/10 pt-8">
                <Skeleton className="mb-6 h-6 w-48" />
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-8">
              <Skeleton className="mb-6 h-8 w-48" />
              <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/8 bg-white/4 p-5">
                    <Skeleton className="mb-3 h-4 w-24" />
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="mt-3 h-4 w-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="sticky top-28 rounded-2xl border border-white/10 bg-zinc-950 p-8">
              <Skeleton className="mb-6 h-6 w-44" />
              <Skeleton className="mb-4 h-12 w-full" borderRadius="0.75rem" />
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="mt-8 space-y-4 border-t border-white/5 pt-8">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function CertificatesVaultSkeleton() {
  return (
    <div
      className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black p-8 text-white md:p-12"
      aria-busy="true"
      aria-label="Loading certificates vault"
    >
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-12 border-l-4 border-red-600 py-2 pl-6">
          <Skeleton className="mb-2 h-12 w-96" />
          <Skeleton className="h-5 w-72" />
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="group relative block overflow-hidden rounded-2xl border border-red-500/20 bg-zinc-950 p-8"
            >
              <div className="mb-8 flex items-start justify-between">
                <Skeleton className="h-16 w-16" borderRadius="1rem" />
                <div className="text-right">
                  <Skeleton className="mb-1 h-3 w-16" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
              <Skeleton className="mb-2 h-8 w-3/4" />
              <Skeleton className="mb-6 h-4 w-48" />
              <div className="flex items-center justify-between border-t border-white/10 pt-6">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CertificateDetailSkeleton() {
  return (
    <div
      className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black px-4 py-12 text-white sm:px-6"
      aria-busy="true"
      aria-label="Loading certificate details"
    >
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-12 lg:flex-row lg:items-start">
        <div className="flex w-full justify-center lg:w-1/2">
          <div className="relative w-full max-w-sm">
            <div className="relative flex aspect-[3/4] flex-col justify-between rounded-[2rem] border border-white/20 bg-zinc-950 p-8">
              <div className="flex items-start justify-between">
                <Skeleton className="h-12 w-12" borderRadius="9999px" />
                <div className="text-right">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="my-8 text-center">
                <Skeleton className="mx-auto mb-6 h-24 w-24" borderRadius="9999px" />
                <Skeleton className="mx-auto mb-2 h-6 w-40" />
                <Skeleton className="mx-auto h-4 w-32" />
              </div>
              <div className="flex items-end justify-between border-t border-white/10 pt-4">
                <div>
                  <Skeleton className="mb-1 h-3 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="text-right">
                  <Skeleton className="mb-1 h-3 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="w-full space-y-8 lg:w-1/2">
          <div>
            <Skeleton className="mb-6 h-4 w-32" />
            <Skeleton className="mb-2 h-12 w-3/4" />
            <Skeleton className="mb-6 h-4 w-48" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
            <Skeleton className="mb-6 h-5 w-40" />
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" borderRadius="0.75rem" />
              ))}
            </div>
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-14 flex-1" borderRadius="0.75rem" />
            <Skeleton className="h-14 w-40" borderRadius="0.75rem" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomePageSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading home page"
    >
      <section className="grid gap-12 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
        <div className="space-y-8">
          <Skeleton className="h-8 w-48" borderRadius="9999px" />
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-10 w-full max-w-2xl" />
          <div className="flex flex-col gap-4 sm:flex-row">
            <Skeleton className="h-14 w-56" borderRadius="9999px" />
            <Skeleton className="h-14 w-44" borderRadius="9999px" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="surface-card p-5">
                <Skeleton className="mb-1 h-8 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
        <div className="surface-card relative overflow-hidden p-8 lg:p-10">
          <Skeleton className="mb-6 h-12 w-48" borderRadius="1rem" />
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/8 bg-white/4 p-5">
                <Skeleton className="mb-2 h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function EnrollPageSkeleton() {
  return (
    <div
      className="min-h-[calc(100vh-80px)] bg-black px-4 py-12 text-white"
      aria-busy="true"
      aria-label="Loading enrollment page"
    >
      <div className="mx-auto max-w-6xl">
        <Skeleton className="mb-8 h-5 w-32" />
        <div className="mb-12 text-center">
          <Skeleton className="mx-auto mb-6 h-8 w-56" borderRadius="9999px" />
          <Skeleton className="mx-auto mb-4 h-12 w-96" />
          <Skeleton className="mx-auto h-5 w-full max-w-2xl" />
        </div>
        <Skeleton className="h-96 w-full" borderRadius="1.5rem" />
      </div>
    </div>
  );
}

export function IdeasPageSkeleton() {
  return (
    <div
      className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black p-6 font-mono text-white md:p-12"
      aria-busy="true"
      aria-label="Loading ideas page"
    >
      <div className="mx-auto flex h-full max-w-7xl flex-col items-center">
        <div className="relative mb-16 w-full border-b border-white/10 pb-12 text-center">
          <Skeleton className="mx-auto mb-2 h-12 w-64" />
          <Skeleton className="mx-auto h-4 w-96" />
        </div>
        <div className="relative w-full max-w-2xl rounded-[2rem] border border-white/10 bg-zinc-950 p-12">
          <Skeleton className="mx-auto mb-6 h-8 w-32" />
          <Skeleton className="mb-4 h-10 w-3/4" />
          <Skeleton className="mb-12 h-5 w-full" />
          <div className="mb-12 grid grid-cols-3 gap-4 border-t border-white/5 pt-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="mb-2 h-3 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-14 w-full" borderRadius="0.75rem" />
        </div>
      </div>
    </div>
  );
}

export function VerifyPageSkeleton() {
  return (
    <div
      className="mx-auto max-w-5xl px-4 pb-20 pt-12 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading verify page"
    >
      <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Skeleton className="h-8 w-56" borderRadius="9999px" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="surface-card p-6 sm:p-8">
          <Skeleton className="mb-3 h-5 w-44" />
          <Skeleton className="mb-5 h-12 w-full" borderRadius="1rem" />
          <Skeleton className="h-12 w-full" borderRadius="1rem" />
        </div>
      </section>
    </div>
  );
}

export function AnalyticsDashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading analytics dashboard">
      <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
        <Skeleton className="mb-2 h-8 w-56" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
            <Skeleton className="mb-2 h-4 w-24" />
            <div className="flex items-end justify-between">
              <Skeleton className="h-10 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
            <Skeleton className="mb-4 h-6 w-40" />
            <Skeleton className="h-64 w-full" borderRadius="1rem" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
            <Skeleton className="mb-4 h-6 w-40" />
            <Skeleton className="h-64 w-full" borderRadius="1rem" />
          </div>
        ))}
      </div>
      <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
        <Skeleton className="mb-4 h-6 w-40" />
        <Skeleton className="h-48 w-full" borderRadius="1rem" />
      </div>
      <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
        <Skeleton className="mb-4 h-6 w-40" />
        <Skeleton className="h-48 w-full" borderRadius="1rem" />
      </div>
    </div>
  );
}

export function AdminContentSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading admin content"
    >
      <Skeleton className="mb-3 h-8 w-48" borderRadius="9999px" />
      <Skeleton className="mb-3 h-12 w-3/4" />
      <Skeleton className="mb-8 h-5 w-full max-w-3xl" />
      <div className="surface-card p-6 sm:p-8">
        <Skeleton className="mb-3 h-5 w-32" />
        <Skeleton className="mb-6 h-12 w-full" borderRadius="1rem" />
        <Skeleton className="h-64 w-full" borderRadius="1rem" />
      </div>
    </div>
  );
}

export function PerformanceMetricsSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading performance metrics">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-8" borderRadius="0.5rem" />
            </div>
            <Skeleton className="mt-4 h-9 w-20" />
            <Skeleton className="mt-2 h-4 w-36" />
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <Skeleton className="h-5 w-36" />
              <Skeleton className="mt-1 h-3.5 w-48" />
            </div>
            <Skeleton className="h-8 w-24" borderRadius="0.5rem" />
          </div>
          <Skeleton className="h-64 w-full" borderRadius="1rem" />
        </div>
        <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-3.5 w-44" />
            </div>
            <Skeleton className="h-8 w-24" borderRadius="0.5rem" />
          </div>
          <Skeleton className="h-64 w-full" borderRadius="1rem" />
        </div>
      </div>

      {/* Achievement Badges Section */}
      <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
        <Skeleton className="mb-2 h-6 w-48" />
        <Skeleton className="mb-6 h-4 w-72" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center rounded-xl border border-white/5 bg-white/2 p-4 text-center"
            >
              <Skeleton className="mb-3 h-12 w-12" borderRadius="9999px" />
              <Skeleton className="mb-1 h-4 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>

      {/* Profiler Section */}
      <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
        <Skeleton className="mb-2 h-4 w-40" />
        <Skeleton className="mb-6 h-7 w-60" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-7 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CertificatesAnalyticsSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading certificates analytics"
    >
      {/* Title */}
      <div className="mb-8">
        <Skeleton className="mb-2 h-4 w-32" />
        <Skeleton className="h-10 w-72" />
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
            <Skeleton className="mb-2 h-3.5 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="mt-2 h-3.5 w-32" />
          </div>
        ))}
      </div>

      {/* Charts / Table */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
        <Skeleton className="mb-4 h-6 w-44" />
        <Skeleton className="mb-6 h-4 w-64" />
        <Skeleton className="h-72 w-full" borderRadius="1rem" />
      </div>
    </div>
  );
}

export function SubscriptionsSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading subscriptions"
    >
      <div className="mb-10 text-center">
        <Skeleton className="mx-auto mb-3 h-10 w-64" />
        <Skeleton className="mx-auto h-5 w-96 max-w-full" />
      </div>

      {/* Active Subscription Summary */}
      <div className="mb-12 rounded-2xl border border-blue-500/20 bg-blue-50/50 p-6 dark:bg-zinc-900">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <Skeleton className="mb-2 h-4 w-28" />
            <Skeleton className="h-7 w-48" />
          </div>
          <Skeleton className="h-10 w-32" borderRadius="0.5rem" />
        </div>
      </div>

      {/* Pricing Tiers Grid */}
      <div className="grid gap-8 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <Skeleton className="mb-2 h-6 w-32" />
            <Skeleton className="mb-6 h-9 w-24" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
            <Skeleton className="mt-8 h-11 w-full" borderRadius="0.5rem" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BrainstormSkeleton() {
  return (
    <div
      className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900"
      aria-busy="true"
      aria-label="Loading brainstorm session"
    >
      {/* Toolbar */}
      <div className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-9" borderRadius="0.5rem" />
          ))}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 p-6">
          <div className="h-full rounded-2xl border border-dashed border-gray-300 bg-white/50 p-6 dark:border-gray-700 dark:bg-gray-950/40">
            <Skeleton className="h-full w-full" borderRadius="1rem" />
          </div>
        </div>
        {/* Chat / Sidebar */}
        <div className="w-80 border-l border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <Skeleton className="mb-4 h-6 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                <Skeleton className="mb-1 h-3.5 w-20" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuizSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl px-4 py-16 sm:px-6"
      aria-busy="true"
      aria-label="Loading quiz arena"
    >
      {/* Header with progress */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Skeleton className="mb-2 h-4 w-24" />
          <Skeleton className="h-7 w-44" />
        </div>
        <Skeleton className="h-8 w-20" borderRadius="9999px" />
      </div>

      {/* Progress Bar */}
      <Skeleton className="mb-8 h-2.5 w-full" borderRadius="9999px" />

      {/* Question Card */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-8 shadow-xl">
        <Skeleton className="mb-4 h-4 w-32" />
        <Skeleton className="mb-3 h-8 w-full" />
        <Skeleton className="mb-8 h-8 w-3/4" />

        {/* 4 Answer Choice Blocks */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/3 p-4"
            >
              <Skeleton className="h-8 w-8" borderRadius="0.5rem" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>

        {/* Action Controls */}
        <div className="mt-8 flex justify-between">
          <Skeleton className="h-10 w-24" borderRadius="0.5rem" />
          <Skeleton className="h-10 w-32" borderRadius="0.5rem" />
        </div>
      </div>
    </div>
  );
}

export function BridgeTrackerSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading bridge tracker"
    >
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <Skeleton className="mb-2 h-4 w-32" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-36" borderRadius="0.5rem" />
          <Skeleton className="h-10 w-28" borderRadius="0.5rem" />
        </div>
      </div>

      {/* Metrics Row */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="surface-card p-6">
            <Skeleton className="mb-2 h-3.5 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="mt-2 h-3.5 w-36" />
          </div>
        ))}
      </div>

      {/* Data Table Skeleton */}
      <div className="surface-card overflow-hidden">
        <div className="border-b border-white/8 p-4">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="p-4 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-white/5 pb-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-20" borderRadius="9999px" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
