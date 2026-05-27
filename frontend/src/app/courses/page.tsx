'use client';

import { Course, coursesAPI } from '@/lib/api';
import { ArrowRight, BookOpen, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await coursesAPI.getAll();
        if (mounted) setCourses(data);
      } catch {
        if (mounted) setCourses([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredCourses = courses.filter((course) => {
    const haystack =
      `${course.title} ${course.description || ''} ${course.instructor}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8">
      <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <span className="eyebrow">Learning modules</span>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-5xl">
            A clearer catalog for students who just want to get started.
          </h1>
          <p className="max-w-xl text-base leading-8 text-[var(--muted)]">
            Browse the active modules, understand who teaches them, and jump into the next useful
            step without digging through overloaded screens.
          </p>
          <div className="surface-card p-6">
            <p className="text-sm leading-7 text-[var(--muted)]">
              Focus areas include blockchain fundamentals, Soroban smart contracts, and practical
              open-source contribution patterns for hackathon teams.
            </p>
          </div>
        </div>

        <div className="surface-card p-6 sm:p-8">
          <label
            htmlFor="course-search"
            className="mb-3 block text-sm font-medium text-[var(--text-strong)]"
          >
            Search modules
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              id="course-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try Soroban, DeFi, beginner, Stellar..."
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-11 py-3.5 text-sm text-[var(--text-strong)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--brand)]"
            />
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {loading
              ? 'Loading modules...'
              : `${filteredCourses.length} module${filteredCourses.length === 1 ? '' : 's'} available`}
          </p>
        </div>
      </section>

      <section className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading &&
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="surface-card h-72 animate-pulse p-6" />
          ))}

        {!loading &&
          filteredCourses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="surface-card group flex h-full flex-col justify-between p-6 transition hover:translate-y-[-2px] hover:border-[rgba(240,100,45,0.35)]"
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/6 text-[var(--brand-strong)]">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-white/6 px-3 py-1 text-xs font-medium text-[var(--text-strong)]">
                    {course.credits} credits
                  </span>
                </div>
                <h2 className="mt-5 text-xl font-semibold text-[var(--text-strong)]">
                  {course.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                  {course.description || 'Description coming soon.'}
                </p>
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-white/8 pt-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    Instructor
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--text-strong)]">
                    {course.instructor}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-strong)]">
                  Open
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}

        {!loading && filteredCourses.length === 0 && (
          <div className="surface-card col-span-full p-8 text-center">
            <h2 className="text-xl font-semibold text-[var(--text-strong)]">No modules found</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Try a different search term or clear the filter to see the full learning catalog.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
