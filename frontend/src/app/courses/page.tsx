'use client';

import { useI18n } from '@/i18n';
import { Course, CourseDataSource, coursesAPI } from '@/lib/api';
import { ArrowRight, BookOpen, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { ErrorBoundary, ErrorFallback, CourseListSkeleton, DemoDataBanner } from '@/components/ui';

export default function CoursesPage() {
  const { t } = useI18n();
  const [courses, setCourses] = useState<Course[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<CourseDataSource>('live');
  const [demoMessage, setDemoMessage] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await coursesAPI.getAllWithSource();
      setCourses(result.courses);
      setDataSource(result.dataSource);
      setDemoMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    load();
    return () => {
      mounted = false;
    };
  }, [load]);

  const filteredCourses = courses.filter((course) => {
    const haystack =
      `${course.title} ${course.description || ''} ${course.instructor}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const countLabel = t('courses.page.count_available')
    .replace('{count}', String(filteredCourses.length))
    .replace('{plural}', filteredCourses.length === 1 ? '' : 's');

  return (
    <ErrorBoundary>
      <div className="relative min-h-screen bg-black overflow-hidden font-mono selection:bg-red-500/30 pb-24" aria-busy={loading}>
        {/* Abstract Background Glows */}
        <div className="absolute top-0 left-[20%] w-[50%] h-[30%] rounded-full bg-[radial-gradient(circle,rgba(220,38,38,0.1),transparent_70%)] blur-[100px] pointer-events-none" />
        
        <div className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8 relative z-10">
          {!loading && dataSource === 'demo' && <DemoDataBanner message={demoMessage} />}
          <section className="grid gap-12 lg:grid-cols-[1fr_1fr] items-end mb-16">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-[10px] font-black tracking-widest uppercase shadow-[0_0_20px_rgba(220,38,38,0.2)]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('courses.page.eyebrow')}</span>
              </div>
              <h1 className="text-5xl sm:text-7xl font-black tracking-tighter text-white uppercase leading-[1.05]">
                {t('courses.page.title')}
              </h1>
              <p className="max-w-xl text-sm sm:text-base leading-relaxed text-gray-400 font-light border-l-2 border-red-500/50 pl-4">
                {t('courses.page.description')}
              </p>
            </div>

            <div className="bg-zinc-950/60 border border-white/5 p-8 rounded-[2rem] backdrop-blur-md shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
              <label
                htmlFor="course-search"
                className="mb-4 block text-[10px] font-black uppercase tracking-[0.2em] text-red-500"
              >
                {t('courses.page.search_label')}
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                <input
                  id="course-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('courses.page.search_placeholder')}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 pl-14 pr-6 py-4 text-sm text-white font-medium outline-none transition-all placeholder:text-gray-600 focus:border-red-500/50 focus:bg-white/10 focus:shadow-[0_0_20px_rgba(220,38,38,0.2)]"
                />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  {loading ? t('courses.page.loading') : countLabel}
                </p>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/50 animate-pulse delay-75" />
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 animate-pulse delay-150" />
                </div>
              </div>
            </div>
          </section>

          {loading && <CourseListSkeleton />}

          {error && !loading && (
            <div className="mt-10">
              <ErrorFallback message={error} onRetry={load} variant="card" />
            </div>
          )}

          {!loading && !error && (
            <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredCourses.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="group relative flex flex-col justify-between bg-zinc-900/40 border border-white/5 p-8 rounded-[2rem] overflow-hidden transition-all hover:-translate-y-2 hover:bg-zinc-900/80 hover:border-red-500/40 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110">
                    <BookOpen className="w-32 h-32" />
                  </div>
                  <div className="relative z-10 flex-1">
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-all shadow-[0_0_15px_rgba(220,38,38,0.1)] group-hover:shadow-[0_0_25px_rgba(220,38,38,0.3)]">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-[9px] font-black tracking-[0.2em] uppercase text-white">
                        {t('courses.page.credits').replace('{credits}', String(course.credits))}
                      </span>
                    </div>
                    <h2 className="text-xl font-black text-white uppercase tracking-wider mb-3">
                      {course.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-gray-400 font-light line-clamp-3">
                      {course.description || t('courses.page.description_fallback')}
                    </p>
                  </div>

                  <div className="relative z-10 mt-8 pt-6 border-t border-white/5 flex items-end justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-500 mb-1">
                        {t('courses.page.instructor')}
                      </p>
                      <p className="text-xs font-bold text-white uppercase tracking-wider">
                        {course.instructor}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white group-hover:text-red-400 transition-colors">
                      {t('courses.page.open')}
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              ))}

              {!loading && filteredCourses.length === 0 && (
                <div className="col-span-full bg-zinc-950/60 border border-white/5 rounded-[2rem] p-16 text-center backdrop-blur-sm">
                  <div className="w-16 h-16 mx-auto bg-white/5 rounded-2xl flex items-center justify-center mb-6">
                    <Search className="w-8 h-8 text-gray-500" />
                  </div>
                  <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-2">{t('courses.page.no_results_title')}</h2>
                  <p className="text-sm text-gray-400 font-light">
                    {t('courses.page.no_results_description')}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
