"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { allLessons, courses, storageKeys } from "../curriculum-data";
import { CompletionModal, launchCompletionConfetti } from "./CompletionCelebration";
import { ProgressRing } from "./ProgressRing";
import { SocialIdentityPanel } from "@/components/social/SocialIdentityPanel";
import { useAuth } from "@/contexts/AuthContext";
import { learningAPI } from "@/lib/learning-api";

const readList = (key: string) => {
  if (typeof window === "undefined") return [] as string[];
  try {
    return JSON.parse(window.localStorage.getItem(key) || "[]") as string[];
  } catch {
    return [];
  }
};

const saveList = (key: string, value: string[]) => {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
};

function useSafeAuth() {
  try {
    return useAuth();
  } catch {
    return {
      user: null,
      token: typeof window !== "undefined" ? localStorage.getItem("token") : null,
      isAuthenticated: typeof window !== "undefined" && Boolean(localStorage.getItem("token")),
      isLoading: false,
    };
  }
}

export function LearningDashboard() {
  const { user, isAuthenticated } = useSafeAuth();
  const [courseId, setCourseId] = useState(courses[0].id);
  const [lessonId, setLessonId] = useState(courses[0].lessons[0].id);
  const [completed, setCompleted] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const course = courses.find((item) => item.id === courseId) || courses[0];
  const lesson = course.lessons.find((item) => item.id === lessonId) || course.lessons[0];
  const lessonIndex = course.lessons.findIndex((item) => item.id === lesson.id);
  const lessonKey = `${course.id}:${lesson.id}`;
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const bookmarkSet = useMemo(() => new Set(bookmarks), [bookmarks]);
  const percent = Math.round((completedSet.size / allLessons.length) * 100);
  const savedLessons = allLessons.filter((item) => bookmarkSet.has(`${item.courseId}:${item.id}`));

  // Bi-directional synchronization layer syncing lesson completion and bookmarks
  // between localStorage and PostgreSQL Prisma backend.
  const syncProgress = useCallback(async () => {
    // 1. Easy: Read from local storage fallback
    const localCompleted = readList(storageKeys.completed);
    const localBookmarks = readList(storageKeys.bookmarks);

    // Initial render / fallback
    setCompleted(localCompleted);
    setBookmarks(localBookmarks);

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token && !isAuthenticated) {
      return;
    }

    try {
      setIsSyncing(true);
      // 2. Medium: Connect to GET /api/v1/learning/progress
      const backendData = await learningAPI.getOverallProgress();
      if (backendData) {
        // 3. Advanced: Bi-directional synchronization
        const backendCompleted = backendData.completedLessons || [];
        const backendBookmarks = backendData.bookmarks || [];

        // Union merge between local storage and backend records
        const mergedCompleted = Array.from(new Set([...localCompleted, ...backendCompleted]));
        const mergedBookmarks = Array.from(new Set([...localBookmarks, ...backendBookmarks]));

        setCompleted(mergedCompleted);
        saveList(storageKeys.completed, mergedCompleted);

        setBookmarks(mergedBookmarks);
        saveList(storageKeys.bookmarks, mergedBookmarks);

        // Sync local additions back to database if any
        const hasLocalAdditions =
          mergedCompleted.some((item) => !backendCompleted.includes(item)) ||
          mergedBookmarks.some((item) => !backendBookmarks.includes(item));

        if (hasLocalAdditions) {
          await learningAPI.syncOverallProgress({
            completedLessons: mergedCompleted,
            bookmarks: mergedBookmarks,
          });
        }
      }
    } catch (err) {
      console.warn("Backend progress sync failed, falling back to local storage:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    syncProgress();
  }, [syncProgress, user?.id]);

  // Sync on online event
  useEffect(() => {
    const handleOnline = () => {
      syncProgress();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncProgress]);

  function toggleBookmark() {
    const next = bookmarkSet.has(lessonKey)
      ? bookmarks.filter((item) => item !== lessonKey)
      : [...bookmarks, lessonKey];
    setBookmarks(next);
    saveList(storageKeys.bookmarks, next);

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token || isAuthenticated) {
      learningAPI
        .syncOverallProgress({
          completedLessons: completed,
          bookmarks: next,
        })
        .catch((err) => console.warn("Background bookmark sync failed:", err));
    }
  }

  function completeLesson() {
    const next = completedSet.has(lessonKey) ? completed : [...completed, lessonKey];
    setCompleted(next);
    saveList(storageKeys.completed, next);

    const alreadyShown = window.localStorage.getItem(storageKeys.celebrated) === "true";
    if (next.length === allLessons.length && !alreadyShown) {
      window.localStorage.setItem(storageKeys.celebrated, "true");
      launchCompletionConfetti();
      setModalOpen(true);
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token || isAuthenticated) {
      learningAPI
        .syncOverallProgress({
          completedLessons: next,
          bookmarks,
        })
        .catch((err) => console.warn("Background lesson completion sync failed:", err));
    }
  }

  function move(direction: -1 | 1) {
    const nextIndex = lessonIndex + direction;
    if (nextIndex >= 0 && nextIndex < course.lessons.length) setLessonId(course.lessons[nextIndex].id);
  }

  return (
    <main className="min-h-screen bg-black pb-28 text-white selection:bg-red-500/30">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/20 via-black to-black pointer-events-none" />
      <section className="relative mx-auto max-w-6xl space-y-8 px-6 py-8">
        <header className="relative overflow-hidden rounded-3xl border border-red-500/20 bg-black/60 backdrop-blur-2xl p-8 shadow-[0_20px_60px_rgba(220,38,38,0.1)]">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-red-600/10 blur-[100px]" />
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Web3 Student Lab
            </p>
            <div>
              {isSyncing ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-400 border border-orange-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" /> Syncing...
                </span>
              ) : isAuthenticated ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Cloud Synced
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500" /> Local Storage
                </span>
              )}
            </div>
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Curriculum Progress Dashboard</h1>
          <p className="mt-3 max-w-2xl text-gray-400">Track lessons, save study routes, and celebrate full course completion.</p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-gradient-to-r from-orange-600 to-red-600 shadow-[0_0_15px_rgba(220,38,38,0.8)] transition-all duration-1000 ease-out" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-3 text-sm font-bold tracking-widest uppercase text-white">{percent}% complete</p>
        </header>

        <SocialIdentityPanel />

        <section className="grid gap-5 md:grid-cols-3">
          {courses.map((item) => {
            const done = item.lessons.filter((entry) => completedSet.has(`${item.id}:${entry.id}`)).length;
            const isActive = item.id === course.id;
            return (
              <button key={item.id} onClick={() => { setCourseId(item.id); setLessonId(item.lessons[0].id); }} className={`group relative overflow-hidden rounded-3xl border p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(220,38,38,0.15)] ${isActive ? "border-red-500/40 bg-red-500/10 shadow-[0_0_30px_rgba(220,38,38,0.1)]" : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"}`}>
                {isActive && <div className="absolute inset-0 bg-gradient-to-br from-red-600/10 to-transparent" />}
                <div className="relative z-10">
                  <ProgressRing percentage={(done / item.lessons.length) * 100} accent={isActive ? "stroke-red-500" : "stroke-red-900/50"} />
                  <h2 className="mt-5 text-2xl font-black tracking-tight text-white">{item.title}</h2>
                  <p className="mt-2 text-sm text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">{item.description}</p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-gray-200">
                    <span className={isActive ? "text-red-400" : "text-gray-500"}>{done}/{item.lessons.length}</span> lessons
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-white/10 bg-black/80 backdrop-blur-xl p-8 lg:col-span-2 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-orange-600" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">{course.title}</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-white">{lesson.title}</h2>
                <p className="mt-2 text-sm text-gray-400 uppercase tracking-widest">{lesson.route}</p>
              </div>
              <button onClick={toggleBookmark} className={`rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${bookmarkSet.has(lessonKey) ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 hover:text-white"}`}>
                {bookmarkSet.has(lessonKey) ? "★ Starred" : "☆ Star lesson"}
              </button>
            </div>

            <div className="mt-8 space-y-3">
              {course.lessons.map((item, index) => {
                const key = `${course.id}:${item.id}`;
                const isCurrent = item.id === lesson.id;
                const isCompleted = completedSet.has(key);
                return (
                  <button key={item.id} onClick={() => setLessonId(item.id)} className={`group flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition-all duration-200 ${isCurrent ? "border-red-500/30 bg-red-500/5" : "border-white/5 bg-transparent hover:bg-white/5 hover:border-white/10"}`}>
                    <span className="flex items-center gap-4">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black ${isCurrent ? "bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]" : "bg-white/10 text-gray-400 group-hover:bg-white/20"}`}>{index + 1}</span>
                      <span className={`font-bold tracking-wide ${isCurrent ? "text-white" : "text-gray-300"}`}>{item.title}</span>
                    </span>
                    <span className={`text-xs font-bold uppercase tracking-widest ${isCompleted ? "text-red-400" : "text-gray-500"}`}>{isCompleted ? "Completed" : item.duration}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link href={`/lessons/${course.id}/${lesson.id}`} className="flex-1 text-center rounded-2xl border border-red-500/50 bg-red-500/5 px-5 py-4 text-sm font-black uppercase tracking-[0.2em] text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.1)] transition-all duration-300 hover:scale-[1.02] hover:bg-red-500/20 hover:text-red-300 hover:shadow-[0_0_25px_rgba(220,38,38,0.2)]">
                Take Lesson
              </Link>
              <button onClick={completeLesson} className={`flex-1 rounded-2xl px-5 py-4 text-sm font-black uppercase tracking-[0.2em] transition-all duration-300 ${completedSet.has(lessonKey) ? "border border-red-500/50 bg-red-500/10 text-red-400" : "bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:scale-[1.02] hover:bg-red-500 hover:shadow-[0_0_30px_rgba(220,38,38,0.6)]"}`}>
                {completedSet.has(lessonKey) ? "Completed" : "Mark Complete"}
              </button>
            </div>
          </article>

          <aside className="rounded-3xl border border-white/5 bg-white/[0.02] p-8">
            <h2 className="text-xl font-black uppercase tracking-widest text-white">Study Base</h2>
            <p className="mt-2 text-xs text-gray-500 uppercase tracking-widest">Bookmarked lessons</p>
            <div className="mt-8 space-y-4">
              {savedLessons.length === 0 ? <p className="text-sm text-gray-500 text-center py-8 rounded-2xl border border-dashed border-white/10">Star lessons to save them here.</p> : savedLessons.map((item) => (
                <a key={`${item.courseId}:${item.id}`} href={`/lessons/${item.courseId}/${item.id}`} className="group block rounded-2xl border border-white/5 bg-black p-5 transition-all hover:-translate-y-1 hover:border-red-500/30 hover:bg-white/5 hover:shadow-[0_10px_30px_rgba(220,38,38,0.1)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">{item.courseTitle}</p>
                  <p className="mt-1 font-bold text-gray-200 group-hover:text-white">{item.title}</p>
                </a>
              ))}
            </div>
          </aside>
        </section>
      </section>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/80 backdrop-blur-2xl px-6 py-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="mx-auto flex max-w-6xl items-center gap-6">
          <button disabled={lessonIndex === 0} onClick={() => move(-1)} className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5">Prev</button>
          <div className="flex-1"><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-red-500 shadow-[0_0_10px_rgba(220,38,38,1)] transition-all duration-500" style={{ width: `${((lessonIndex + 1) / course.lessons.length) * 100}%` }} /></div></div>
          <button disabled={lessonIndex === course.lessons.length - 1} onClick={() => move(1)} className="rounded-xl bg-red-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all hover:bg-red-500 disabled:opacity-30 disabled:hover:bg-red-600">Next</button>
        </div>
      </footer>

      {modalOpen && <CompletionModal onClose={() => setModalOpen(false)} />}
    </main>
  );
}
