'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Course, coursesAPI } from '@/lib/api';
import { ErrorBoundary, AdminContentSkeleton } from '@/components/ui';
import {
  CourseLearningJourney,
  LearningLevel,
  LearningResource,
  LearningTask,
  createJourneyTemplate,
  getLearningJourney,
  saveLearningJourney,
} from '@/lib/learning-journey';
import {
  Plus,
  BookOpen,
  Sparkles,
  Trash2,
  CheckCircle2,
  Layers,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  X,
  GraduationCap,
} from 'lucide-react';

const FALLBACK_SEED_COURSES: Course[] = [
  {
    id: 'cm1yxxxx-intro',
    title: 'Introduction to Web3 and Stellar',
    description:
      'Learn the foundational concepts of blockchain technology, decentralized networks, and how the Stellar consensus protocol enables fast, low-cost cross-border payments.',
    instructor: 'Satoshi N.',
    credits: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cm1yxxxx-soroban',
    title: 'Soroban Smart Contracts 101',
    description:
      'A deep dive into writing secure smart contracts on the Stellar network using Rust and the Soroban SDK. Execute state changes and build immutable modules.',
    instructor: 'Vitalik B.',
    credits: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cm1yxxxx-defi',
    title: 'Decentralized Finance (DeFi) primitives',
    description:
      'Master the core primitives of DeFi including Liquidity Pools, Automated Market Makers (AMMs), and yield generation directly on-chain.',
    instructor: 'Hayden A.',
    credits: 4,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function AdminContentPageImpl() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [journey, setJourney] = useState<CourseLearningJourney | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'courses' | 'curriculum'>('courses');

  // Modal State for Course Creation
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newCourse, setNewCourse] = useState({
    title: '',
    instructor: '',
    description: '',
    credits: 3,
  });

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await coursesAPI.getAll();
      const list = Array.isArray(data) && data.length > 0 ? data : FALLBACK_SEED_COURSES;
      setCourses(list);
      if (list[0]) {
        setSelectedCourseId((current) => current || list[0]!.id);
      }
    } catch {
      // Fallback gracefully so the UI never displays an empty error screen
      setCourses(FALLBACK_SEED_COURSES);
      if (FALLBACK_SEED_COURSES[0]) {
        setSelectedCourseId((current) => current || FALLBACK_SEED_COURSES[0]!.id);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || courses[0] || null,
    [courses, selectedCourseId]
  );

  useEffect(() => {
    if (!selectedCourse) {
      setJourney(null);
      return;
    }

    setJourney(structuredClone(getLearningJourney(selectedCourse)));
    setStatus(null);
  }, [selectedCourse]);

  // Handle Course Creation
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourse.title.trim() || !newCourse.instructor.trim()) {
      setCreateError('Course title and instructor are required.');
      return;
    }

    setCreating(true);
    setCreateError(null);

    const generatedId = `course-${Date.now()}`;
    const coursePayload: Course = {
      id: generatedId,
      title: newCourse.title.trim(),
      instructor: newCourse.instructor.trim(),
      description: newCourse.description.trim(),
      credits: Number(newCourse.credits) || 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const created = await coursesAPI.create(coursePayload);
      const finalCourse = created?.id ? created : coursePayload;
      setCourses((prev) => [finalCourse, ...prev]);
      setSelectedCourseId(finalCourse.id);
      setStatus(`Course "${finalCourse.title}" created successfully.`);
    } catch {
      // Offline fallback: save locally
      setCourses((prev) => [coursePayload, ...prev]);
      setSelectedCourseId(coursePayload.id);
      setStatus(`Course "${coursePayload.title}" created (saved in local studio mode).`);
    } finally {
      setCreating(false);
      setIsCreateModalOpen(false);
      setNewCourse({ title: '', instructor: '', description: '', credits: 3 });
      setActiveTab('curriculum');
    }
  };

  // Handle Course Deletion
  const handleDeleteCourse = async (courseId: string, courseTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${courseTitle}"?`)) return;

    try {
      await coursesAPI.delete(courseId);
    } catch {
      // ignore
    }

    setCourses((prev) => {
      const next = prev.filter((c) => c.id !== courseId);
      if (selectedCourseId === courseId && next[0]) {
        setSelectedCourseId(next[0].id);
      }
      return next;
    });
    setStatus(`Course "${courseTitle}" removed.`);
  };

  const updateJourney = (updates: Partial<CourseLearningJourney>) => {
    setJourney((current) => (current ? { ...current, ...updates } : current));
  };

  const updateLevel = (levelIndex: number, updates: Partial<LearningLevel>) => {
    setJourney((current) => {
      if (!current) return current;
      const levels = current.levels.map((level, index) =>
        index === levelIndex ? { ...level, ...updates } : level
      );
      return { ...current, levels };
    });
  };

  const updateTask = (levelIndex: number, taskIndex: number, updates: Partial<LearningTask>) => {
    setJourney((current) => {
      if (!current) return current;
      const levels = current.levels.map((level, index) => {
        if (index !== levelIndex) return level;
        const tasks = level.tasks.map((task, innerIndex) =>
          innerIndex === taskIndex ? { ...task, ...updates } : task
        );
        return { ...level, tasks };
      });
      return { ...current, levels };
    });
  };

  const updateResource = (
    levelIndex: number,
    resourceIndex: number,
    updates: Partial<LearningResource>
  ) => {
    setJourney((current) => {
      if (!current) return current;
      const levels = current.levels.map((level, index) => {
        if (index !== levelIndex) return level;
        const resources = level.resources.map((resource, innerIndex) =>
          innerIndex === resourceIndex ? { ...resource, ...updates } : resource
        );
        return { ...level, resources };
      });
      return { ...current, levels };
    });
  };

  const addLevel = () => {
    if (!selectedCourse) return;
    setJourney((current) => {
      const base = current || createJourneyTemplate(selectedCourse);
      const nextLevelNumber = base.levels.length + 1;
      const nextLevel: LearningLevel = {
        id: `${selectedCourse.id}-level-${nextLevelNumber}`,
        title: `Level ${nextLevelNumber}: New Stage`,
        summary: 'Describe what learners should focus on in this stage.',
        goal: 'Define the outcome for finishing this level.',
        tasks: [
          {
            id: `${selectedCourse.id}-task-${Date.now()}`,
            title: 'New daily task',
            type: 'watch',
            duration: '10 min',
          },
        ],
        resources: [
          {
            title: 'New learning resource',
            type: 'video',
            duration: '10 min',
            href: 'https://example.com',
          },
        ],
      };
      return { ...base, levels: [...base.levels, nextLevel] };
    });
  };

  const addTask = (levelIndex: number) => {
    if (!selectedCourse) return;
    setJourney((current) => {
      if (!current) return current;
      const levels = current.levels.map((level, index) => {
        if (index !== levelIndex) return level;
        return {
          ...level,
          tasks: [
            ...level.tasks,
            {
              id: `${selectedCourse.id}-task-${Date.now()}-${index}`,
              title: 'New task',
              type: 'read',
              duration: '10 min',
            },
          ],
        };
      });
      return { ...current, levels };
    });
  };

  const addResource = (levelIndex: number) => {
    setJourney((current) => {
      if (!current) return current;
      const levels = current.levels.map((level, index) => {
        if (index !== levelIndex) return level;
        return {
          ...level,
          resources: [
            ...level.resources,
            {
              title: 'New resource',
              type: 'guide',
              duration: '10 min',
              href: 'https://example.com',
            },
          ],
        };
      });
      return { ...current, levels };
    });
  };

  const removeLevel = (levelIndex: number) => {
    setJourney((current) => {
      if (!current) return current;
      return {
        ...current,
        levels: current.levels.filter((_, index) => index !== levelIndex),
      };
    });
  };

  const removeTask = (levelIndex: number, taskIndex: number) => {
    setJourney((current) => {
      if (!current) return current;
      const levels = current.levels.map((level, index) => {
        if (index !== levelIndex) return level;
        return {
          ...level,
          tasks: level.tasks.filter((_, innerIndex) => innerIndex !== taskIndex),
        };
      });
      return { ...current, levels };
    });
  };

  const removeResource = (levelIndex: number, resourceIndex: number) => {
    setJourney((current) => {
      if (!current) return current;
      const levels = current.levels.map((level, index) => {
        if (index !== levelIndex) return level;
        return {
          ...level,
          resources: level.resources.filter((_, innerIndex) => innerIndex !== resourceIndex),
        };
      });
      return { ...current, levels };
    });
  };

  const handleSave = () => {
    if (!selectedCourseId || !journey) return;
    saveLearningJourney(selectedCourseId, journey);
    setStatus('Saved. Learners will see the updated levels and resources on their dashboard.');
  };

  if (loading) {
    return <AdminContentSkeleton />;
  }

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-8" aria-busy={loading}>
        {/* Header Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-red-500/20 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-red-400">
              <Sparkles className="h-3.5 w-3.5" /> Admin Studio
            </div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-black uppercase tracking-wider text-white">
              Course & Curriculum Management
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-400">
              Create new courses, manage existing catalog offerings, and construct interactive learning modules.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-500 transition-all hover:scale-105"
            >
              <Plus className="h-4 w-4" /> Create Course
            </button>
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Status Toast */}
        {status && (
          <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
              <span>{status}</span>
            </div>
            <button
              onClick={() => setStatus(null)}
              className="text-green-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Studio Navigation Tabs */}
        <div className="mt-8 flex gap-3 border-b border-white/10 pb-4">
          <button
            onClick={() => setActiveTab('courses')}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'courses'
                ? 'bg-red-500/20 border border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.2)]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen className="h-4 w-4" /> All Courses ({courses.length})
          </button>
          <button
            onClick={() => setActiveTab('curriculum')}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'curriculum'
                ? 'bg-red-500/20 border border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.2)]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="h-4 w-4" /> Curriculum & Journey Studio
          </button>
        </div>

        {/* TAB 1: ALL COURSES */}
        {activeTab === 'courses' && (
          <div className="mt-8">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => {
                const isSelected = course.id === selectedCourseId;
                return (
                  <div
                    key={course.id}
                    className={`flex flex-col justify-between rounded-2xl border bg-black/60 p-6 backdrop-blur-xl transition-all ${
                      isSelected
                        ? 'border-red-500/50 shadow-[0_0_25px_rgba(220,38,38,0.25)]'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-lg bg-red-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-red-400">
                          {course.credits} Credits
                        </span>
                        <button
                          onClick={() => handleDeleteCourse(course.id, course.title)}
                          title="Delete course"
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <h3 className="mt-3 text-lg font-bold uppercase tracking-wide text-white">
                        {course.title}
                      </h3>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-red-400/80 font-mono">
                        <GraduationCap className="h-3.5 w-3.5" /> Instructor: {course.instructor}
                      </p>
                      <p className="mt-3 text-xs leading-relaxed text-gray-400 line-clamp-3">
                        {course.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
                      <Link
                        href={`/courses/${course.id}`}
                        target="_blank"
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        Preview View ↗
                      </Link>

                      <button
                        onClick={() => {
                          setSelectedCourseId(course.id);
                          setActiveTab('curriculum');
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-red-400 hover:text-red-300"
                      >
                        Edit Modules <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add New Card Slot */}
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-red-500/30 bg-red-500/5 p-6 text-center transition-all hover:border-red-500/60 hover:bg-red-500/10 hover:scale-[1.02]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600/20 text-red-400">
                  <Plus className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-sm font-black uppercase tracking-wider text-white">
                  Add Another Course
                </h4>
                <p className="mt-1 text-xs text-gray-400">
                  Create a new track for Soroban, Rust, or DeFi
                </p>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: CURRICULUM & LEVEL STUDIO */}
        {activeTab === 'curriculum' && (
          <div className="mt-8">
            <div className="rounded-2xl border border-white/10 bg-black/60 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="w-full sm:w-auto flex-1 max-w-md">
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-400">
                    Selected Course
                  </label>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="w-full rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-500/50"
                  >
                    {courses.map((course) => (
                      <option key={course.id} value={course.id} className="bg-zinc-900 text-white">
                        {course.title} ({course.instructor})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={addLevel}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Add Level Stage
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:bg-red-500 transition-all hover:scale-105"
                  >
                    Save Changes
                  </button>
                </div>
              </div>

              {journey && (
                <div className="mt-8 space-y-8">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field
                      label="Track Label"
                      value={journey.levelLabel}
                      onChange={(value) => updateJourney({ levelLabel: value })}
                    />
                    <Field
                      label="Headline"
                      value={journey.headline}
                      onChange={(value) => updateJourney({ headline: value })}
                    />
                    <Field
                      label="Streak Message"
                      value={journey.streakMessage}
                      onChange={(value) => updateJourney({ streakMessage: value })}
                    />
                  </div>

                  <div className="border-t border-white/10 pt-6">
                    <h2 className="text-xl font-bold uppercase tracking-wider text-white mb-6">
                      Course Levels & Modules ({journey.levels.length})
                    </h2>

                    <div className="space-y-6">
                      {journey.levels.map((level, levelIndex) => (
                        <div
                          key={level.id}
                          className="rounded-2xl border border-white/10 bg-white/5 p-6"
                        >
                          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                            <h3 className="text-lg font-bold text-white uppercase tracking-wide">
                              {level.title}
                            </h3>
                            <button
                              type="button"
                              onClick={() => removeLevel(levelIndex)}
                              className="text-xs font-bold text-red-400 hover:text-red-300 uppercase tracking-widest"
                            >
                              Remove Stage
                            </button>
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-3">
                            <Field
                              label="Level Title"
                              value={level.title}
                              onChange={(value) => updateLevel(levelIndex, { title: value })}
                            />
                            <Field
                              label="Summary"
                              value={level.summary}
                              onChange={(value) => updateLevel(levelIndex, { summary: value })}
                            />
                            <Field
                              label="Goal"
                              value={level.goal}
                              onChange={(value) => updateLevel(levelIndex, { goal: value })}
                            />
                          </div>

                          <div className="mt-6 grid gap-6 xl:grid-cols-2">
                            {/* Tasks Column */}
                            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                                  Action Tasks ({level.tasks.length})
                                </h4>
                                <button
                                  type="button"
                                  onClick={() => addTask(levelIndex)}
                                  className="text-xs font-bold text-red-400 hover:text-red-300 uppercase"
                                >
                                  + Add Task
                                </button>
                              </div>

                              <div className="space-y-3">
                                {level.tasks.map((task, taskIndex) => (
                                  <div
                                    key={task.id}
                                    className="grid gap-3 rounded-xl border border-white/5 bg-white/5 p-3 sm:grid-cols-6 items-end"
                                  >
                                    <div className="sm:col-span-3">
                                      <Field
                                        label="Title"
                                        value={task.title}
                                        onChange={(value) =>
                                          updateTask(levelIndex, taskIndex, { title: value })
                                        }
                                      />
                                    </div>
                                    <div className="sm:col-span-1">
                                      <SelectField
                                        label="Type"
                                        value={task.type}
                                        options={['watch', 'read', 'code', 'deploy', 'review']}
                                        onChange={(value) =>
                                          updateTask(levelIndex, taskIndex, {
                                            type: value as LearningTask['type'],
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="sm:col-span-1">
                                      <Field
                                        label="Est."
                                        value={task.duration}
                                        onChange={(value) =>
                                          updateTask(levelIndex, taskIndex, { duration: value })
                                        }
                                      />
                                    </div>
                                    <div className="sm:col-span-1 flex justify-end pb-2">
                                      <button
                                        type="button"
                                        onClick={() => removeTask(levelIndex, taskIndex)}
                                        className="text-xs text-red-400 hover:text-red-300"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Resources Column */}
                            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                                  Learning Resources ({level.resources.length})
                                </h4>
                                <button
                                  type="button"
                                  onClick={() => addResource(levelIndex)}
                                  className="text-xs font-bold text-red-400 hover:text-red-300 uppercase"
                                >
                                  + Add Resource
                                </button>
                              </div>

                              <div className="space-y-3">
                                {level.resources.map((resource, resourceIndex) => (
                                  <div
                                    key={`${level.id}-resource-${resourceIndex}`}
                                    className="grid gap-3 rounded-xl border border-white/5 bg-white/5 p-3 sm:grid-cols-6 items-end"
                                  >
                                    <div className="sm:col-span-2">
                                      <Field
                                        label="Title"
                                        value={resource.title}
                                        onChange={(value) =>
                                          updateResource(levelIndex, resourceIndex, {
                                            title: value,
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="sm:col-span-1">
                                      <SelectField
                                        label="Type"
                                        value={resource.type}
                                        options={['video', 'guide', 'lab', 'quiz']}
                                        onChange={(value) =>
                                          updateResource(levelIndex, resourceIndex, {
                                            type: value as LearningResource['type'],
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <Field
                                        label="URL Link"
                                        value={resource.href}
                                        onChange={(value) =>
                                          updateResource(levelIndex, resourceIndex, {
                                            href: value,
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="sm:col-span-1 flex justify-end pb-2">
                                      <button
                                        type="button"
                                        onClick={() => removeResource(levelIndex, resourceIndex)}
                                        className="text-xs text-red-400 hover:text-red-300"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal: Create Course */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="relative w-full max-w-lg rounded-2xl border border-red-500/30 bg-zinc-950 p-6 sm:p-8 shadow-[0_0_50px_rgba(220,38,38,0.3)] animate-in fade-in zoom-in-95">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="absolute right-4 top-4 text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/20 text-red-400">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold uppercase tracking-wider text-white">
                    Create New Course
                  </h2>
                  <p className="text-xs text-gray-400">Add a course to Web3 Student Lab</p>
                </div>
              </div>

              {createError && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <form onSubmit={handleCreateCourse} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                    Course Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Advanced Soroban DeFi Architectures"
                    value={newCourse.title}
                    onChange={(e) => setNewCourse((p) => ({ ...p, title: e.target.value }))}
                    className="w-full rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-red-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                      Instructor *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Stellar"
                      value={newCourse.instructor}
                      onChange={(e) => setNewCourse((p) => ({ ...p, instructor: e.target.value }))}
                      className="w-full rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                      Credits (1 - 12)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={newCourse.credits}
                      onChange={(e) =>
                        setNewCourse((p) => ({ ...p, credits: parseInt(e.target.value, 10) || 3 }))
                      }
                      className="w-full rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                    Course Description
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Describe curriculum outcomes and prerequisites..."
                    value={newCourse.description}
                    onChange={(e) => setNewCourse((p) => ({ ...p, description: e.target.value }))}
                    className="w-full rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-red-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-500 disabled:opacity-50"
                  >
                    {creating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" /> Creating...
                      </>
                    ) : (
                      'Save & Create Course'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-red-500/50"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-red-500/50"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-zinc-900 text-white">
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default AdminContentPageImpl;
