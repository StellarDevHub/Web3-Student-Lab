'use client';

import { motion } from 'framer-motion';
import {
  LearningGoals,
  PACE_OPTIONS,
  LEARNING_OBJECTIVES,
  MILESTONE_OPTIONS,
} from '@/lib/enrollment/types';

interface Step3GoalsProps {
  data: LearningGoals;
  onUpdate: (data: Partial<LearningGoals>) => void;
  errors: string[];
}

export function Step3Goals({ data, onUpdate, errors }: Step3GoalsProps) {
  const toggleObjective = (objective: string) => {
    const current = data.objectives;
    const isSelected = current.includes(objective);

    if (!isSelected && current.length >= 5) {
      return;
    }

    const updated = current.includes(objective)
      ? current.filter((o) => o !== objective)
      : [...current, objective];
    onUpdate({ objectives: updated });
  };

  const toggleMilestone = (milestone: string) => {
    const current = data.milestones;
    const isSelected = current.includes(milestone);

    if (!isSelected && current.length >= 4) {
      return;
    }

    const updated = current.includes(milestone)
      ? current.filter((m) => m !== milestone)
      : [...current, milestone];
    onUpdate({ milestones: updated });
  };

  return (
    <div className="space-y-6">
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-2xl font-black tracking-wider text-white uppercase">
          Learning Goals
        </h2>
        <p className="text-sm text-zinc-400">Define your objectives and set your learning pace</p>
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
          Learning Objectives
        </h3>
        <p className="text-sm text-zinc-400">
          Select what you want to achieve ({data.objectives.length}/5 selected)
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LEARNING_OBJECTIVES.map((objective) => {
            const isSelected = data.objectives.includes(objective);
            const isDisabled = !isSelected && data.objectives.length >= 5;
            return (
              <motion.button
                key={objective}
                onClick={() => toggleObjective(objective)}
                whileTap={{ scale: 0.98 }}
                disabled={isDisabled}
                className={`rounded-lg border p-3 text-left text-sm transition-all ${
                  isSelected
                    ? 'border-red-500 bg-red-500/10 text-white'
                    : isDisabled
                      ? 'cursor-not-allowed border-zinc-800 bg-zinc-900/40 text-zinc-600'
                      : 'border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                      isSelected ? 'border-red-500 bg-red-500' : 'border-zinc-600'
                    }`}
                  >
                    {isSelected && (
                      <svg
                        className="h-3 w-3 text-white"
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
                    )}
                  </div>
                  {objective}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 font-bold text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs">
            2
          </span>
          Learning Pace
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {PACE_OPTIONS.map((pace) => {
            const isSelected = data.pace === pace.value;
            return (
              <motion.button
                key={pace.value}
                onClick={() => onUpdate({ pace: pace.value })}
                whileTap={{ scale: 0.98 }}
                className={`rounded-lg border p-4 text-center transition-all ${
                  isSelected
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600'
                }`}
              >
                <p className={`font-bold ${isSelected ? 'text-white' : 'text-zinc-400'}`}>
                  {pace.label}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{pace.description}</p>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 font-bold text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs">
            3
          </span>
          Weekly Time Commitment
        </h3>
        <div className="rounded-lg bg-zinc-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-zinc-400">Hours per week</span>
            <span className="font-bold text-white">{data.estimatedHoursPerWeek}h</span>
          </div>
          <input
            type="range"
            min="1"
            max="40"
            value={data.estimatedHoursPerWeek}
            onChange={(e) => onUpdate({ estimatedHoursPerWeek: parseInt(e.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-700 accent-red-500"
          />
          <div className="mt-1 flex justify-between text-xs text-zinc-500">
            <span>1h</span>
            <span>20h</span>
            <span>40h</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 font-bold text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs">
            4
          </span>
          Milestones
        </h3>
        <p className="text-sm text-zinc-400">
          Set your key achievement markers ({data.milestones.length}/4 selected)
        </p>
        <div className="space-y-2">
          {MILESTONE_OPTIONS.map((milestone) => {
            const isSelected = data.milestones.includes(milestone);
            const isDisabled = !isSelected && data.milestones.length >= 4;
            return (
              <motion.button
                key={milestone}
                onClick={() => toggleMilestone(milestone)}
                whileTap={{ scale: 0.98 }}
                disabled={isDisabled}
                className={`w-full rounded-lg border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-red-500 bg-red-500/10 text-white'
                    : isDisabled
                      ? 'cursor-not-allowed border-zinc-800 bg-zinc-900/40 text-zinc-600'
                      : 'border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                      isSelected ? 'border-red-500 bg-red-500' : 'border-zinc-600'
                    }`}
                  >
                    {isSelected && (
                      <svg
                        className="h-3 w-3 text-white"
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
                    )}
                  </div>
                  {milestone}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
