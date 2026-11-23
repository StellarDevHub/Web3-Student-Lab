'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { coursesAPI, Course } from '@/lib/api';
import { CourseSelection } from '@/lib/enrollment/types';

interface Step1CourseSelectionProps {
  data: CourseSelection;
  onUpdate: (data: Partial<CourseSelection>) => void;
  errors: string[];
}

export function Step1CourseSelection({ data, onUpdate, errors }: Step1CourseSelectionProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function loadCourses() {
      try {
        const allCourses = await coursesAPI.getAll();
        setCourses(allCourses);
      } catch (error) {
        console.error('Failed to load courses:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadCourses();
  }, []);

  const filteredCourses = courses.filter(
    (course) =>
      course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.instructor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectCourse = (course: Course) => {
    onUpdate({
      selectedCourseId: course.id,
      selectedCourseTitle: course.title,
      selectedCourseCredits: course.credits,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600/30 border-t-red-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-2xl font-black tracking-wider text-white uppercase">
          Select Your Module
        </h2>
        <p className="text-sm text-zinc-400">Choose a course to begin your learning journey</p>
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Search courses..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 pl-12 text-white placeholder-zinc-500 transition-all focus:border-transparent focus:ring-2 focus:ring-red-500"
        />
        <svg
          className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-zinc-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {errors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-4"
        >
          {errors.map((error, index) => (
            <p key={index} className="flex items-center gap-2 text-sm text-red-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {error}
            </p>
          ))}
        </motion.div>
      )}

      <div className="grid max-h-[400px] grid-cols-1 gap-4 overflow-y-auto pr-2 md:grid-cols-2">
        {filteredCourses.map((course) => {
          const isSelected = data.selectedCourseId === course.id;

          return (
            <motion.button
              key={course.id}
              onClick={() => handleSelectCourse(course)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                isSelected
                  ? 'border-red-500 bg-red-500/10'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="mb-2 flex items-start justify-between">
                <h3 className="text-sm font-bold text-white">{course.title}</h3>
                <span className="rounded bg-red-500/10 px-2 py-1 font-mono text-xs text-red-500">
                  {course.credits} CR
                </span>
              </div>
              <p className="mb-3 line-clamp-2 text-xs text-zinc-400">
                {course.description || 'No description available'}
              </p>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                {course.instructor}
              </div>
              {isSelected && (
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500"
                >
                  <svg
                    className="h-4 w-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      {filteredCourses.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-zinc-500">No courses found matching your search</p>
        </div>
      )}
    </div>
  );
}
