'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Course, coursesAPI } from '@/lib/api';
import {
  CourseLearningJourney,
  LearningLevel,
  LearningResource,
  LearningTask,
  createJourneyTemplate,
  getLearningJourney,
  saveLearningJourney,
} from '@/lib/learning-journey';

export default function AdminContentPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [journey, setJourney] = useState<CourseLearningJourney | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCourses() {
      try {
        const data = await coursesAPI.getAll();
        if (!mounted) return;
        setCourses(data);
        if (data[0]) {
          setSelectedCourseId((current) => current || data[0]!.id);
        }
      } catch {
        if (!mounted) return;
        setCourses([]);
      }
    }

    loadCourses();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
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

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="eyebrow">Admin content studio</span>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--text-strong)]">
            Create levels, tasks, videos, and learning flow.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
            This editor controls what students see after enrollment. Pick a course, define the
            levels, and attach videos, guides, labs, and daily tasks.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm font-medium text-[var(--text-strong)]"
        >
          Back to dashboard
        </Link>
      </div>

      <div className="mt-8 surface-card p-6 sm:p-8">
        <label className="mb-3 block text-sm font-medium text-[var(--text-strong)]">
          Choose course
        </label>
        <select
          value={selectedCourseId}
          onChange={(event) => setSelectedCourseId(event.target.value)}
          className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-[var(--text-strong)] outline-none"
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>

        {journey && (
          <div className="mt-8 space-y-8">
            <div className="grid gap-4 md:grid-cols-3">
              <Field
                label="Track label"
                value={journey.levelLabel}
                onChange={(value) => updateJourney({ levelLabel: value })}
              />
              <Field
                label="Headline"
                value={journey.headline}
                onChange={(value) => updateJourney({ headline: value })}
              />
              <Field
                label="Streak message"
                value={journey.streakMessage}
                onChange={(value) => updateJourney({ streakMessage: value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-[var(--text-strong)]">Levels</h2>
              <button
                type="button"
                onClick={addLevel}
                className="rounded-2xl bg-[rgba(240,100,45,0.14)] px-4 py-3 text-sm font-medium text-[var(--text-strong)]"
              >
                Add level
              </button>
            </div>

            <div className="space-y-6">
              {journey.levels.map((level, levelIndex) => (
                <div
                  key={level.id}
                  className="rounded-[1.75rem] border border-white/8 bg-white/4 p-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-semibold text-[var(--text-strong)]">
                      {level.title}
                    </h3>
                    <button
                      type="button"
                      onClick={() => removeLevel(levelIndex)}
                      className="text-sm text-red-300"
                    >
                      Remove level
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Field
                      label="Level title"
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
                    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-medium text-[var(--text-strong)]">Tasks</h4>
                        <button
                          type="button"
                          onClick={() => addTask(levelIndex)}
                          className="text-sm text-[var(--brand-strong)]"
                        >
                          Add task
                        </button>
                      </div>
                      <div className="mt-4 space-y-4">
                        {level.tasks.map((task, taskIndex) => (
                          <div
                            key={task.id}
                            className="rounded-2xl border border-white/8 bg-white/4 p-4"
                          >
                            <div className="grid gap-3 md:grid-cols-4">
                              <Field
                                label="Task title"
                                value={task.title}
                                onChange={(value) =>
                                  updateTask(levelIndex, taskIndex, { title: value })
                                }
                              />
                              <Field
                                label="Duration"
                                value={task.duration}
                                onChange={(value) =>
                                  updateTask(levelIndex, taskIndex, { duration: value })
                                }
                              />
                              <SelectField
                                label="Type"
                                value={task.type}
                                options={['watch', 'read', 'build', 'quiz']}
                                onChange={(value) =>
                                  updateTask(levelIndex, taskIndex, {
                                    type: value as LearningTask['type'],
                                  })
                                }
                              />
                              <ActionCell onRemove={() => removeTask(levelIndex, taskIndex)} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-medium text-[var(--text-strong)]">Resources</h4>
                        <button
                          type="button"
                          onClick={() => addResource(levelIndex)}
                          className="text-sm text-[var(--brand-strong)]"
                        >
                          Add resource
                        </button>
                      </div>
                      <div className="mt-4 space-y-4">
                        {level.resources.map((resource, resourceIndex) => (
                          <div
                            key={`${resource.title}-${resourceIndex}`}
                            className="rounded-2xl border border-white/8 bg-white/4 p-4"
                          >
                            <div className="grid gap-3 md:grid-cols-5">
                              <Field
                                label="Title"
                                value={resource.title}
                                onChange={(value) =>
                                  updateResource(levelIndex, resourceIndex, { title: value })
                                }
                              />
                              <Field
                                label="Duration"
                                value={resource.duration}
                                onChange={(value) =>
                                  updateResource(levelIndex, resourceIndex, { duration: value })
                                }
                              />
                              <SelectField
                                label="Type"
                                value={resource.type}
                                options={['video', 'guide', 'lab']}
                                onChange={(value) =>
                                  updateResource(levelIndex, resourceIndex, {
                                    type: value as LearningResource['type'],
                                  })
                                }
                              />
                              <Field
                                label="Link"
                                value={resource.href}
                                onChange={(value) =>
                                  updateResource(levelIndex, resourceIndex, { href: value })
                                }
                              />
                              <ActionCell
                                onRemove={() => removeResource(levelIndex, resourceIndex)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleSave}
                className="rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white"
              >
                Save learning content
              </button>
              {status && <p className="text-sm text-emerald-300">{status}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
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
      <span className="mb-2 block text-xs font-medium tracking-[0.18em] text-[var(--muted)] uppercase">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-[var(--text-strong)] outline-none"
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
      <span className="mb-2 block text-xs font-medium tracking-[0.18em] text-[var(--muted)] uppercase">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-[var(--text-strong)] outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionCell({ onRemove }: { onRemove: () => void }) {
  return (
    <div className="flex items-end">
      <button type="button" onClick={onRemove} className="text-sm text-red-300">
        Remove
      </button>
    </div>
  );
}
