'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Flame,
  GraduationCap,
  PlayCircle,
  Target,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Certificate,
  Course,
  Enrollment,
  certificatesAPI,
  coursesAPI,
  enrollmentsAPI,
} from '@/lib/api';
import { getLearningJourney, LearningLevel, LearningTask } from '@/lib/learning-journey';

type ProgressState = Record<string, boolean>;

const STORAGE_KEY = 'learning_dashboard_progress';

export default function DashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<ProgressState>({});

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setCompletedTasks(JSON.parse(raw) as ProgressState);
      }
    } catch {
      setCompletedTasks({});
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedTasks));
  }, [completedTasks]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [courseData, certificateData, enrollmentData] = await Promise.all([
          coursesAPI.getAll(),
          user ? certificatesAPI.getByStudentId(user.id) : Promise.resolve([]),
          user ? enrollmentsAPI.getByStudentId(user.id) : Promise.resolve([]),
        ]);

        if (!mounted) return;
        setCourses(courseData);
        setCertificates(certificateData);
        setEnrollments(enrollmentData);
      } catch {
        if (!mounted) return;
        setCourses([]);
        setCertificates([]);
        setEnrollments([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [user]);

  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);

  const enrolledCourses = useMemo(
    () =>
      enrollments
        .map((enrollment) => ({
          enrollment,
          course: enrollment.course || courseMap.get(enrollment.courseId),
        }))
        .filter((entry): entry is { enrollment: Enrollment; course: Course } =>
          Boolean(entry.course)
        ),
    [enrollments, courseMap]
  );

  useEffect(() => {
    if (enrolledCourses.length === 0) {
      setActiveCourseId(null);
      return;
    }

    setActiveCourseId((current) =>
      current && enrolledCourses.some((entry) => entry.course.id === current)
        ? current
        : enrolledCourses[0]!.course.id
    );
  }, [enrolledCourses]);

  const activeCourse =
    enrolledCourses.find((entry) => entry.course.id === activeCourseId)?.course || null;
  const activeJourney = activeCourse ? getLearningJourney(activeCourse) : null;

  const taskCompletion = useMemo(() => {
    if (!activeJourney) {
      return { total: 0, done: 0 };
    }

    const allTasks = activeJourney.levels.flatMap((level) => level.tasks);
    const done = allTasks.filter((task) => completedTasks[task.id]).length;
    return { total: allTasks.length, done };
  }, [activeJourney, completedTasks]);

  const activeLevelIndex = useMemo(() => {
    if (!activeJourney) {
      return 0;
    }

    const firstIncomplete = activeJourney.levels.findIndex((level) =>
      level.tasks.some((task) => !completedTasks[task.id])
    );

    return firstIncomplete === -1 ? activeJourney.levels.length - 1 : firstIncomplete;
  }, [activeJourney, completedTasks]);

  const activeLevel = activeJourney?.levels[activeLevelIndex] || null;
  const dailyTasks = activeLevel?.tasks.slice(0, 3) || [];
  const completedCount = taskCompletion.done;
  const totalCount = taskCompletion.total;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentLevelNumber = activeLevelIndex + 1;

  const quickStats = [
    { label: 'Enrolled tracks', value: enrolledCourses.length, icon: BookOpen },
    { label: 'Finished tasks', value: completedCount, icon: CheckCircle2 },
    { label: 'Issued credentials', value: certificates.length, icon: GraduationCap },
  ];

  const toggleTask = (taskId: string) => {
    setCompletedTasks((current) => ({
      ...current,
      [taskId]: !current[taskId],
    }));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <span className="eyebrow">Student learning dashboard</span>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-5xl">
            Learn in levels, show up daily, and keep moving through your track.
          </h1>
          <p className="max-w-2xl text-base leading-8 text-[var(--muted)]">
            This is your study base after enrollment: read the content, watch guided lessons,
            complete today&apos;s tasks, and work upward level by level.
          </p>
          <div>
            <Link
              href="/admin/content"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm font-medium text-[var(--text-strong)]"
            >
              Open content admin
            </Link>
          </div>
        </div>

        <div className="surface-card overflow-hidden p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-[var(--brand-strong)] uppercase">
                Daily momentum
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--text-strong)]">
                {activeJourney?.levelLabel || 'No active track yet'}
              </h2>
              <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                {activeJourney?.streakMessage ||
                  'Enroll in a course to unlock daily tasks, reading flow, and level progression.'}
              </p>
            </div>
            <div className="rounded-2xl bg-[rgba(240,100,45,0.14)] p-3 text-[var(--brand-strong)]">
              <Flame className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {quickStats.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/7 text-[var(--brand-strong)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="mt-4 text-2xl font-semibold text-[var(--text-strong)]">
                    {loading ? '...' : item.value}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {loading && <div className="mt-10 h-64 animate-pulse rounded-[2rem] bg-white/5" />}

      {!loading && enrolledCourses.length === 0 && (
        <section className="mt-10 surface-card p-8 sm:p-10">
          <h2 className="text-2xl font-semibold text-[var(--text-strong)]">
            Start your first learning track
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
            After you enroll, this page becomes your daily learning workspace with levels, tasks,
            lesson links, and progress tracking.
          </p>
          <div className="mt-6">
            <Link
              href="/courses"
              className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(240,100,45,0.35)] bg-[rgba(240,100,45,0.12)] px-5 py-3 text-sm font-medium text-[var(--text-strong)]"
            >
              Browse courses
            </Link>
          </div>
        </section>
      )}

      {!loading && enrolledCourses.length > 0 && activeCourse && activeJourney && activeLevel && (
        <>
          <section className="mt-10 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="surface-card p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-semibold tracking-[0.18em] text-[var(--brand-strong)] uppercase">
                    Active learning track
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-[var(--text-strong)]">
                    {activeCourse.title}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
                    {activeJourney.headline}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-right">
                  <p className="text-xs tracking-[0.18em] text-[var(--muted)] uppercase">
                    Current level
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[var(--text-strong)]">
                    Level {currentLevelNumber}
                  </p>
                </div>
              </div>

              <div className="mt-8 rounded-[1.75rem] border border-white/8 bg-white/4 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-strong)]">
                      {activeLevel.title}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                      {activeLevel.summary}
                    </p>
                  </div>
                  <div className="hidden rounded-2xl bg-[rgba(240,100,45,0.12)] p-3 text-[var(--brand-strong)] sm:block">
                    <Trophy className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="text-[var(--muted)]">Track progress</span>
                    <span className="font-medium text-[var(--text-strong)]">
                      {progressPercent}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand),#f4a261)] transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs leading-6 text-[var(--muted)]">
                    Goal for this level: {activeLevel.goal}
                  </p>
                </div>
              </div>
            </div>

            <div className="surface-card p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-500/12 p-3 text-emerald-300">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text-strong)]">
                    Today&apos;s tasks
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    Finish these and your momentum stays alive.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {dailyTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    checked={!!completedTasks[task.id]}
                    onToggle={() => toggleTask(task.id)}
                  />
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-white/8 bg-white/4 p-4">
                <p className="text-xs tracking-[0.18em] text-[var(--muted)] uppercase">
                  Done today
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--text-strong)]">
                  {dailyTasks.filter((task) => completedTasks[task.id]).length}/{dailyTasks.length}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-8 xl:grid-cols-[0.82fr_1.18fr]">
            <div className="space-y-8">
              <div className="surface-card p-6 sm:p-8">
                <h2 className="text-xl font-semibold text-[var(--text-strong)]">Your tracks</h2>
                <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                  Switch between enrolled courses and continue learning where you left off.
                </p>

                <div className="mt-6 space-y-3">
                  {enrolledCourses.map(({ enrollment, course }) => {
                    const isActive = course.id === activeCourse.id;
                    const journey = getLearningJourney(course);
                    return (
                      <button
                        key={enrollment.id}
                        type="button"
                        onClick={() => setActiveCourseId(course.id)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          isActive
                            ? 'border-[rgba(240,100,45,0.4)] bg-[rgba(240,100,45,0.12)]'
                            : 'border-white/8 bg-white/4 hover:border-[rgba(240,100,45,0.25)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-strong)]">
                              {course.title}
                            </p>
                            <p className="mt-2 text-xs text-[var(--muted)]">{journey.levelLabel}</p>
                          </div>
                          <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-medium capitalize text-emerald-300">
                            {enrollment.status}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="surface-card p-6 sm:p-8">
                <h2 className="text-xl font-semibold text-[var(--text-strong)]">
                  Milestone rewards
                </h2>
                <div className="mt-5 space-y-3">
                  <MilestoneCard
                    label="Level cleared"
                    copy="Finish every task in your current level to unlock the next one."
                  />
                  <MilestoneCard
                    label="Credential path"
                    copy="When the course work is done, come back and mint your certificate."
                  />
                  <MilestoneCard
                    label="Builder habit"
                    copy="Try to complete at least one task per day to keep momentum strong."
                  />
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="surface-card p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-blue-500/12 p-3 text-blue-300">
                    <PlayCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-[var(--text-strong)]">
                      Lessons and resources
                    </h2>
                    <p className="text-sm text-[var(--muted)]">
                      Videos, reading, and labs for the level you&apos;re in now.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {activeLevel.resources.map((resource) => (
                    <a
                      key={resource.title}
                      href={resource.href}
                      target={resource.href.startsWith('http') ? '_blank' : undefined}
                      rel={resource.href.startsWith('http') ? 'noreferrer' : undefined}
                      className="rounded-2xl border border-white/8 bg-white/4 p-5 transition hover:border-[rgba(240,100,45,0.35)]"
                    >
                      <p className="text-xs tracking-[0.18em] text-[var(--brand-strong)] uppercase">
                        {resource.type}
                      </p>
                      <h3 className="mt-3 text-lg font-semibold text-[var(--text-strong)]">
                        {resource.title}
                      </h3>
                      <div className="mt-5 flex items-center justify-between text-sm text-[var(--muted)]">
                        <span>{resource.duration}</span>
                        <span>Open</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              <div className="surface-card p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/7 p-3 text-[var(--text-strong)]">
                    <Clock3 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-[var(--text-strong)]">
                      Level roadmap
                    </h2>
                    <p className="text-sm text-[var(--muted)]">
                      Move through the course one stage at a time.
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {activeJourney.levels.map((level, index) => (
                    <LevelCard
                      key={level.id}
                      level={level}
                      levelNumber={index + 1}
                      isCurrent={index === activeLevelIndex}
                      completedTasks={completedTasks}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TaskRow({
  task,
  checked,
  onToggle,
}: {
  task: LearningTask;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-4 rounded-2xl border px-4 py-4 text-left transition ${
        checked
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-white/8 bg-white/4 hover:border-[rgba(240,100,45,0.25)]'
      }`}
    >
      <div
        className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${
          checked
            ? 'border-emerald-400 bg-emerald-400 text-black'
            : 'border-white/15 text-transparent'
        }`}
      >
        <CheckCircle2 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-[var(--text-strong)]">{task.title}</p>
          <span className="text-xs text-[var(--muted)]">{task.duration}</span>
        </div>
        <p className="mt-2 text-xs tracking-[0.18em] text-[var(--muted)] uppercase">{task.type}</p>
      </div>
    </button>
  );
}

function LevelCard({
  level,
  levelNumber,
  isCurrent,
  completedTasks,
}: {
  level: LearningLevel;
  levelNumber: number;
  isCurrent: boolean;
  completedTasks: ProgressState;
}) {
  const completed = level.tasks.filter((task) => completedTasks[task.id]).length;
  const total = level.tasks.length;

  return (
    <div
      className={`rounded-2xl border p-5 ${
        isCurrent
          ? 'border-[rgba(240,100,45,0.35)] bg-[rgba(240,100,45,0.08)]'
          : 'border-white/8 bg-white/4'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.18em] text-[var(--brand-strong)] uppercase">
            Level {levelNumber}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--text-strong)]">{level.title}</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{level.summary}</p>
        </div>
        {isCurrent && (
          <span className="rounded-full bg-[rgba(240,100,45,0.16)] px-3 py-1 text-xs font-medium text-[var(--text-strong)]">
            Current
          </span>
        )}
      </div>
      <p className="mt-4 text-xs text-[var(--muted)]">
        {completed}/{total} tasks finished
      </p>
    </div>
  );
}

function MilestoneCard({ label, copy }: { label: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
      <p className="text-sm font-semibold text-[var(--text-strong)]">{label}</p>
      <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{copy}</p>
    </div>
  );
}
