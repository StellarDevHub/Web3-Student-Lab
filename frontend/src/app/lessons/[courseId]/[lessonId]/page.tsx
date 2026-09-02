'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import LessonWorkspace from '@/components/lesson/LessonWorkspace';
import { useParams, notFound } from 'next/navigation';
import { courses, allLessons, storageKeys } from '@/app/curriculum-data';

export default function LessonDetailPage() {
  const params = useParams();
  const courseId = params?.courseId as string;
  const lessonId = params?.lessonId as string;

  const course = courses.find((c) => c.id === courseId);
  const lesson = course?.lessons.find((l) => l.id === lessonId);

  const [completed, setCompleted] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        setCompleted(JSON.parse(window.localStorage.getItem(storageKeys.completed) || "[]"));
      } catch {}
    }
  }, []);

  if (!course || !lesson) {
    return notFound();
  }

  const lessonKey = `${course.id}:${lesson.id}`;
  const isCompleted = completed.includes(lessonKey);

  function markComplete() {
    if (!isCompleted) {
      const next = [...completed, lessonKey];
      setCompleted(next);
      if (typeof window !== "undefined") window.localStorage.setItem(storageKeys.completed, JSON.stringify(next));
    }
  }

  const currentIndex = allLessons.findIndex(l => l.id === lesson.id && l.courseId === course.id);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  return (
    <div className="bg-background text-foreground relative min-h-screen overflow-hidden pb-20 transition-colors duration-200">
      {/* Background glows */}
      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-red-600/5 blur-[150px]"></div>
      <div className="pointer-events-none absolute bottom-0 left-0 h-[600px] w-[600px] rounded-full bg-red-600/5 blur-[120px]"></div>

      {/* Navigation */}
      <nav className="bg-bg-secondary/80 border-border-theme relative sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center gap-4">
            <Link
              href="/"
              className="text-text-secondary hover:text-foreground flex items-center gap-2 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-bold tracking-widest uppercase">Back to Dashboard</span>
            </Link>
            <span className="text-foreground flex items-center gap-2 text-2xl font-black tracking-tighter uppercase">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500"></span>
              {course.title}
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 border-l-4 border-red-600 py-2 pl-6"
        >
          <h1 className="text-foreground mb-3 text-4xl font-black tracking-tight uppercase md:text-5xl">
            {lesson.title}
          </h1>
          <p className="text-text-secondary text-lg font-light tracking-wide">
            Follow the lesson below and experiment in the live editor.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <LessonWorkspace title={lesson.title} starterCode={lesson.starterCode || ""}>
            {lesson.content?.map((paragraph, idx) => (
              <p key={idx} className="mb-4">
                {paragraph}
              </p>
            ))}
          </LessonWorkspace>

          {/* Lesson Actions */}
          <div className="mt-12 flex flex-col md:flex-row items-center justify-between gap-6 border-t border-white/10 pt-8">
            <div className="flex-1 flex justify-start">
              {prevLesson && (
                <Link
                  href={`/lessons/${prevLesson.courseId}/${prevLesson.id}`}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-xs font-black uppercase tracking-widest transition-colors hover:bg-white/10"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Previous Lesson
                </Link>
              )}
            </div>

            <div className="flex-1 flex justify-center">
              <button
                onClick={markComplete}
                disabled={isCompleted}
                className={`flex items-center gap-3 rounded-2xl px-8 py-4 text-sm font-black uppercase tracking-[0.2em] transition-all duration-300 ${isCompleted ? "border border-red-500/50 bg-red-500/10 text-red-400" : "bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:scale-[1.02] hover:bg-red-500 hover:shadow-[0_0_30px_rgba(220,38,38,0.6)]"}`}
              >
                <CheckCircle className="h-5 w-5" />
                {isCompleted ? "Completed" : "Mark Complete"}
              </button>
            </div>

            <div className="flex-1 flex justify-end">
              {nextLesson && (
                <Link
                  href={`/lessons/${nextLesson.courseId}/${nextLesson.id}`}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-xs font-black uppercase tracking-widest transition-colors hover:bg-white/10"
                >
                  Next Lesson
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
