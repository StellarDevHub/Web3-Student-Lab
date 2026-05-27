'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { PrerequisiteCheck } from '@/lib/enrollment/types';

interface Step2PrerequisitesProps {
  data: PrerequisiteCheck;
  onUpdate: (data: Partial<PrerequisiteCheck>) => void;
  errors: string[];
  coursePrerequisites?: string[];
  completedCourseIds?: string[];
}

const SKILL_QUESTIONS = [
  {
    id: 1,
    question: 'What is a smart contract?',
    options: [
      { id: 'a', text: 'A legal document', correct: false },
      { id: 'b', text: 'Self-executing code on blockchain', correct: true },
      { id: 'c', text: 'A type of cryptocurrency', correct: false },
    ],
  },
  {
    id: 2,
    question: 'Which of these is a feature of blockchain?',
    options: [
      { id: 'a', text: 'Centralized control', correct: false },
      { id: 'b', text: 'Immutable records', correct: true },
      { id: 'c', text: 'Unlimited scalability', correct: false },
    ],
  },
  {
    id: 3,
    question: 'What is Stellar used for?',
    options: [
      { id: 'a', text: 'Gaming', correct: false },
      { id: 'b', text: 'Cross-border payments', correct: true },
      { id: 'c', text: 'Video streaming', correct: false },
    ],
  },
];

const PREP_MATERIALS = [
  { id: 'intro', title: 'Blockchain Fundamentals', duration: '2 hours', type: 'Video' },
  { id: 'stellar', title: 'Stellar Ecosystem Overview', duration: '1.5 hours', type: 'Article' },
  { id: 'soroban', title: 'Soroban Basics', duration: '3 hours', type: 'Tutorial' },
];

export function Step2Prerequisites({
  data,
  onUpdate,
  errors,
  coursePrerequisites = [],
  completedCourseIds = [],
}: Step2PrerequisitesProps) {
  const [activeTab, setActiveTab] = useState<'check' | 'assessment' | 'materials'>('check');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);

  const missingPrereqs = coursePrerequisites.filter(
    (prereq) => !completedCourseIds.includes(prereq)
  );

  const hasMissingPrereqs = missingPrereqs.length > 0;

  const handleAnswer = (questionId: number, optionId: string) => {
    const newAnswers = { ...answers, [questionId]: optionId };
    setAnswers(newAnswers);

    if (Object.keys(newAnswers).length === SKILL_QUESTIONS.length) {
      let correct = 0;
      SKILL_QUESTIONS.forEach((q) => {
        const selected = newAnswers[q.id];
        const correctOption = q.options.find((o) => o.correct);
        if (selected === correctOption?.id) correct++;
      });

      const score = Math.round((correct / SKILL_QUESTIONS.length) * 100);
      onUpdate({ skillAssessmentScore: score, hasRequiredSkills: score >= 60 });
      setShowResults(true);
    }
  };

  const handleMaterialView = () => {
    onUpdate({ prepMaterialsViewed: true });
  };

  return (
    <div className="space-y-6">
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-2xl font-black tracking-wider text-white uppercase">
          Prerequisites Check
        </h2>
        <p className="text-sm text-zinc-400">
          Verify your qualifications or complete the skill assessment
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        {[
          { id: 'check', label: 'Check', icon: '✓' },
          { id: 'assessment', label: 'Assessment', icon: '📝' },
          { id: 'materials', label: 'Prep Materials', icon: '📚' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-red-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
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

      {activeTab === 'check' && (
        <div className="space-y-4">
          <h3 className="mb-4 font-bold text-white">Required Prerequisites</h3>

          {coursePrerequisites.length === 0 ? (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <p className="flex items-center gap-2 text-green-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                No prerequisites required for this course
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {coursePrerequisites.map((prereq) => {
                const isCompleted = completedCourseIds.includes(prereq);
                return (
                  <div
                    key={prereq}
                    className={`flex items-center justify-between rounded-lg border p-4 ${
                      isCompleted
                        ? 'border-green-500/30 bg-green-500/10'
                        : 'border-zinc-800 bg-zinc-900'
                    }`}
                  >
                    <span className={isCompleted ? 'text-green-400' : 'text-zinc-400'}>
                      {prereq}
                    </span>
                    {isCompleted ? (
                      <span className="flex items-center gap-1 text-sm text-green-500">
                        <svg
                          className="h-4 w-4"
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
                        Completed
                      </span>
                    ) : (
                      <span className="text-sm text-amber-500">Required</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasMissingPrereqs && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-400">
                Missing prerequisites detected. You can either complete the skill assessment or
                finish the prerequisite courses first.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'assessment' && (
        <div className="space-y-6">
          {!showResults ? (
            <>
              <p className="mb-4 text-sm text-zinc-400">
                Answer these questions to demonstrate your knowledge. Score 60% or higher to
                proceed.
              </p>
              {SKILL_QUESTIONS.map((q, index) => (
                <div key={q.id} className="rounded-lg bg-zinc-900 p-4">
                  <p className="mb-3 font-medium text-white">
                    {index + 1}. {q.question}
                  </p>
                  <div className="space-y-2">
                    {q.options.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => handleAnswer(q.id, option.id)}
                        className={`w-full rounded-lg border p-3 text-left transition-all ${
                          answers[q.id] === option.id
                            ? 'border-red-500 bg-red-500/10 text-white'
                            : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        {option.text}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`rounded-lg p-6 text-center ${
                data.skillAssessmentScore >= 60
                  ? 'border border-green-500/30 bg-green-500/10'
                  : 'border border-red-500/30 bg-red-500/10'
              }`}
            >
              <div className="mb-2 text-4xl font-black">{data.skillAssessmentScore}%</div>
              <p className={data.skillAssessmentScore >= 60 ? 'text-green-400' : 'text-red-400'}>
                {data.skillAssessmentScore >= 60
                  ? 'Congratulations! You passed the assessment.'
                  : 'You need 60% or higher to proceed. Review the prep materials.'}
              </p>
              {data.skillAssessmentScore < 60 && (
                <button
                  onClick={() => {
                    setAnswers({});
                    setShowResults(false);
                    onUpdate({ skillAssessmentScore: 0, hasRequiredSkills: false });
                  }}
                  className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-white hover:bg-zinc-700"
                >
                  Retry Assessment
                </button>
              )}
            </motion.div>
          )}
        </div>
      )}

      {activeTab === 'materials' && (
        <div className="space-y-4">
          <p className="mb-4 text-sm text-zinc-400">
            Recommended preparation materials to help you succeed:
          </p>
          {PREP_MATERIALS.map((material) => (
            <div
              key={material.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <div>
                <h4 className="font-medium text-white">{material.title}</h4>
                <p className="text-sm text-zinc-500">
                  {material.type} • {material.duration}
                </p>
              </div>
              <button
                onClick={handleMaterialView}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                View
              </button>
            </div>
          ))}
          {data.prepMaterialsViewed && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-sm text-green-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Prep materials viewed
            </motion.p>
          )}
        </div>
      )}
    </div>
  );
}
