'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { StudySchedule, DAYS_OF_WEEK } from '@/lib/enrollment/types';

interface Step4ScheduleProps {
  data: StudySchedule;
  onUpdate: (data: Partial<StudySchedule>) => void;
  errors: string[];
}

export function Step4Schedule({ data, onUpdate, errors }: Step4ScheduleProps) {
  const [showCalendar, setShowCalendar] = useState(false);

  const toggleDay = (day: (typeof DAYS_OF_WEEK)[number]['value']) => {
    const current = data.preferredDays;
    const updated = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    onUpdate({ preferredDays: updated });
  };

  const calculateRecommendedEndDate = (): string => {
    const today = new Date();
    const recommended = new Date(today);
    recommended.setDate(today.getDate() + 84);
    return recommended.toISOString().split('T')[0];
  };

  return (
    <div className="space-y-6">
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-2xl font-black tracking-wider text-white uppercase">
          Schedule Planning
        </h2>
        <p className="text-sm text-zinc-400">Set your study schedule and target completion date</p>
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

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 font-bold text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs">
            1
          </span>
          Preferred Study Days
        </h3>
        <div className="grid grid-cols-7 gap-2">
          {DAYS_OF_WEEK.map((day) => {
            const isSelected = data.preferredDays.includes(day.value);
            return (
              <motion.button
                key={day.value}
                onClick={() => toggleDay(day.value)}
                whileTap={{ scale: 0.95 }}
                className={`rounded-lg border p-3 text-center transition-all ${
                  isSelected
                    ? 'border-red-500 bg-red-500/10 text-white'
                    : 'border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <span className="text-xs font-bold">{day.label}</span>
              </motion.button>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500">
          Selected: {data.preferredDays.length > 0 ? data.preferredDays.join(', ') : 'None'}
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 font-bold text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs">
            2
          </span>
          Preferred Time Range
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm text-zinc-400">Start Time</label>
            <input
              type="time"
              value={data.preferredTimeStart}
              onChange={(e) => onUpdate({ preferredTimeStart: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-transparent focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-zinc-400">End Time</label>
            <input
              type="time"
              value={data.preferredTimeEnd}
              onChange={(e) => onUpdate({ preferredTimeEnd: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-transparent focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 font-bold text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs">
            3
          </span>
          Target Completion Date
        </h3>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <input
            type="date"
            value={data.targetCompletionDate}
            onChange={(e) => onUpdate({ targetCompletionDate: e.target.value })}
            min={new Date().toISOString().split('T')[0]}
            className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white focus:border-transparent focus:ring-2 focus:ring-red-500"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-zinc-500">Recommended: 12 weeks from today</p>
            <button
              onClick={() => onUpdate({ targetCompletionDate: calculateRecommendedEndDate() })}
              className="text-xs text-red-500 transition-colors hover:text-red-400"
            >
              Use Recommended
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 font-bold text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs">
            4
          </span>
          Calendar Preview
        </h3>
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-3 text-white transition-colors hover:bg-zinc-700"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {showCalendar ? 'Hide Calendar' : 'Show Calendar Preview'}
        </button>

        {showCalendar && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="grid grid-cols-7 gap-1 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="py-2 text-xs font-bold text-zinc-500">
                  {day}
                </div>
              ))}
              {Array.from({ length: 35 }).map((_, index) => {
                const dayOfWeek = index % 7;
                const dayNames = [
                  'sunday',
                  'monday',
                  'tuesday',
                  'wednesday',
                  'thursday',
                  'friday',
                  'saturday',
                ];
                const isStudyDay = data.preferredDays.includes(
                  dayNames[dayOfWeek] as (typeof DAYS_OF_WEEK)[number]['value']
                );
                return (
                  <div
                    key={index}
                    className={`flex aspect-square items-center justify-center rounded text-xs ${
                      isStudyDay
                        ? 'border border-red-500/30 bg-red-500/20 text-red-400'
                        : 'bg-zinc-800/50 text-zinc-600'
                    }`}
                  >
                    {(index % 30) + 1}
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-center text-xs text-zinc-500">
              <span className="mr-2 inline-block h-3 w-3 rounded border border-red-500/30 bg-red-500/20" />
              Study days highlighted in red
            </p>
          </motion.div>
        )}
      </div>

      {data.preferredDays.length > 0 && data.targetCompletionDate && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-green-500/30 bg-green-500/10 p-4"
        >
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-medium text-green-400">Schedule looks good!</p>
              <p className="mt-1 text-sm text-green-400/70">
                You will study {data.preferredDays.length} days per week, targeting completion by{' '}
                {new Date(data.targetCompletionDate).toLocaleDateString()}.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
