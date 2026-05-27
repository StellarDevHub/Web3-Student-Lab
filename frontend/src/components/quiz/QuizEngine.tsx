'use client';

import quizMachine from '@/lib/quizMachine';
import { quizQuestions } from '@/lib/quizQuestions';
import { Player } from '@lottiefiles/react-lottie-player';
import { useMachine } from '@xstate/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

const successAnimationUrl = 'https://assets8.lottiefiles.com/packages/lf20_LpD8u5.json';

const questionDuration = 1000;

const getDisplayLabel = (question: any) => {
  if (question.type === 'multiple-choice') return 'Choose the best answer.';
  if (question.type === 'drag-order') return 'Drag the statements into the correct order.';
  if (question.type === 'code-fill') return 'Fill the code snippet using the missing line.';
  return 'Answer the question.';
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function QuizEngine() {
  const [current, send] = useMachine(quizMachine);
  const [timeLeft, setTimeLeft] = useState(0);
  const question = quizQuestions[current.context.currentIndex];
  const isQuestionState = current.matches('question');
  const isAnswerState = current.matches('answer');
  const isCompleteState = current.matches('complete');

  useEffect(() => {
    if (current.matches('idle')) {
      setTimeLeft(question.time);
      return;
    }

    if (isQuestionState) {
      setTimeLeft(question.time);
      const interval = window.setInterval(() => {
        setTimeLeft((currentLeft) => {
          const next = currentLeft - 1;
          if (next <= 0) {
            window.clearInterval(interval);
            send({ type: 'TIMEOUT' });
            return 0;
          }
          return next;
        });
      }, questionDuration);
      return () => window.clearInterval(interval);
    }

    return undefined;
  }, [current, question, isQuestionState, send]);

  const percentage = useMemo(() => {
    return question.time > 0 ? clamp((timeLeft / question.time) * 100, 0, 100) : 0;
  }, [question.time, timeLeft]);

  const dragItemKey = (segment: string) => segment.replace(/\s+/g, '-').toLowerCase();

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, index: number) => {
    event.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
    if (Number.isNaN(sourceIndex)) return;

    const nextOrder = [...current.context.dragOrder];
    const [moved] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(index, 0, moved);
    send({ type: 'UPDATE_ORDER', order: nextOrder });
  };

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <div className="min-h-screen bg-[#050505] px-4 py-16 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <section className="rounded-[40px] border border-white/10 bg-[#111111]/80 p-8 shadow-[0_0_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-sm tracking-[0.35em] text-red-500 uppercase">
                Interactive Quiz Arena
              </p>
              <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                Gamified Stellar Quiz
              </h1>
              <p className="leading-7 text-gray-400">
                Test your Soroban and Stellar knowledge in a fast-paced quiz built with XState and
                life lines for every question. Use hints, try 50/50, and keep your streak alive.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="rounded-3xl bg-white/5 p-4">
                <p className="text-sm tracking-[0.35em] text-gray-400 uppercase">Question</p>
                <p className="mt-2 text-3xl font-black text-white">{question.id.slice(1)}</p>
              </div>
              <div className="rounded-3xl bg-white/5 p-4">
                <p className="text-sm tracking-[0.35em] text-gray-400 uppercase">Score</p>
                <p className="mt-2 text-3xl font-black text-red-500">{current.context.score}</p>
              </div>
            </div>
          </div>
        </section>

        <AnimatePresence mode="wait">
          {current.matches('idle') && (
            <motion.section
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35 }}
              className="rounded-[40px] border border-white/10 bg-[#111111]/80 p-10 shadow-[0_0_40px_rgba(0,0,0,0.25)]"
            >
              <div className="space-y-6 text-center">
                <p className="text-sm tracking-[0.35em] text-red-500 uppercase">Ready to learn?</p>
                <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                  Start the quiz and unlock instant feedback.
                </h2>
                <p className="mx-auto max-w-2xl text-gray-400">
                  Each question adapts to your learning path. Use the hint or 50/50 lifeline
                  strategically to improve your recall and confidence.
                </p>
                <button
                  onClick={() => send({ type: 'START' })}
                  className="inline-flex items-center justify-center rounded-full bg-red-600 px-8 py-4 font-bold tracking-[0.25em] text-white uppercase shadow-[0_12px_30px_rgba(220,38,38,0.25)] transition hover:bg-red-700"
                >
                  Launch Quiz
                </button>
              </div>
            </motion.section>
          )}

          {isQuestionState && (
            <motion.section
              key="question"
              initial={{ opacity: 0, scale: 0.98, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -16 }}
              transition={{ duration: 0.35 }}
              className="grid gap-8 xl:grid-cols-[1.5fr_0.9fr]"
            >
              <div className="rounded-[40px] border border-white/10 bg-[#0e0e0e]/90 p-8 shadow-[0_0_40px_rgba(0,0,0,0.28)]">
                <div className="flex flex-col gap-4">
                  <div className="inline-flex items-center rounded-full bg-white/5 px-4 py-2 text-xs tracking-[0.35em] text-gray-400 uppercase">
                    {getDisplayLabel(question)}
                  </div>
                  <h2 className="text-2xl font-extrabold text-white">{question.prompt}</h2>
                  <p className="text-sm text-gray-400">{question.time} seconds to answer.</p>
                </div>

                <div className="mt-8 space-y-6">
                  {question.type === 'multiple-choice' && (
                    <div className="grid gap-4">
                      {current.context.visibleChoices.map((choice) => {
                        const active = choice === current.context.selectedOption;
                        return (
                          <button
                            key={choice}
                            onClick={() => send({ type: 'SELECT_OPTION', choice })}
                            className={`rounded-3xl border px-5 py-4 text-left text-base font-medium transition-all ${
                              active
                                ? 'border-red-500 bg-red-500/15 text-white shadow-[0_0_20px_rgba(220,38,38,0.15)]'
                                : 'border-white/10 bg-white/5 text-gray-200 hover:border-red-500/30 hover:bg-white/10'
                            }`}
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {question.type === 'drag-order' && (
                    <div className="space-y-4">
                      <p className="text-gray-400">Drag each step into the sequence you expect.</p>
                      <div className="grid gap-3">
                        {current.context.dragOrder.map((segment, index) => (
                          <button
                            key={dragItemKey(segment)}
                            type="button"
                            draggable
                            onDragStart={(event) => handleDragStart(event, index)}
                            onDragOver={handleDragOver}
                            onDrop={(event) => handleDrop(event, index)}
                            className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-left text-base text-gray-200 transition hover:border-red-500/40 hover:bg-white/10"
                          >
                            <span className="text-xs tracking-[0.25em] text-red-500 uppercase">
                              Step {index + 1}
                            </span>
                            <p className="mt-3 font-semibold text-white">{segment}</p>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs tracking-[0.25em] text-gray-500 uppercase">
                        Tip: drag items to swap positions, then submit when the order looks right.
                      </p>
                    </div>
                  )}

                  {question.type === 'code-fill' && (
                    <div className="space-y-5 rounded-3xl border border-white/10 bg-black/40 p-6">
                      <pre className="text-sm whitespace-pre-wrap text-gray-200">
                        {question.snippet.map((line, index) => {
                          if (line.trim() === '_____') {
                            return (
                              <span
                                key={index}
                                className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-white"
                              >
                                <span className="text-red-500">_____.</span>
                              </span>
                            );
                          }
                          return <span key={index}>{line}\n</span>;
                        })}
                      </pre>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {current.context.visibleChoices.map((choice) => {
                          const active = choice === current.context.snippetSelection;
                          return (
                            <button
                              key={choice}
                              onClick={() => send({ type: 'UPDATE_SNIPPET', choice })}
                              className={`rounded-3xl border px-4 py-3 text-left transition-all ${
                                active
                                  ? 'border-red-500 bg-red-500/15 text-white'
                                  : 'border-white/10 bg-white/5 text-gray-200 hover:border-red-500/40 hover:bg-white/10'
                              }`}
                            >
                              {choice}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => send({ type: 'USE_HINT' })}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm tracking-[0.25em] text-gray-300 uppercase transition hover:border-red-500/40 hover:text-white"
                    >
                      Hint
                    </button>
                    <button
                      type="button"
                      onClick={() => send({ type: 'USE_FIFTY_FIFTY' })}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm tracking-[0.25em] text-gray-300 uppercase transition hover:border-red-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={current.context.fiftyUsed}
                    >
                      50/50
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => send({ type: 'SUBMIT' })}
                    disabled={
                      !current.matches('question') ||
                      (!current.context.selectedOption &&
                        question.type !== 'drag-order' &&
                        question.type !== 'code-fill')
                    }
                    className="rounded-full bg-red-600 px-6 py-3 text-sm font-black tracking-[0.25em] text-white uppercase transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Submit Answer
                  </button>
                </div>

                {current.context.hintUsed && (
                  <div className="mt-6 rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-gray-100">
                    <p className="font-semibold text-red-200">Hint</p>
                    <p className="mt-2 text-gray-200">{question.hint}</p>
                  </div>
                )}
              </div>

              <aside className="rounded-[40px] border border-white/10 bg-[#111111]/80 p-8 shadow-[0_0_40px_rgba(0,0,0,0.28)]">
                <div className="space-y-6">
                  <div>
                    <p className="text-sm tracking-[0.35em] text-gray-400 uppercase">
                      Time Remaining
                    </p>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-red-500 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="mt-2 text-3xl font-black text-white">{timeLeft}s</p>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p className="text-xs tracking-[0.35em] text-gray-400 uppercase">Lifelines</p>
                    <div className="mt-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between rounded-3xl bg-black/40 px-4 py-3 text-sm text-white">
                        <span>Hint</span>
                        <span
                          className={current.context.hintUsed ? 'text-red-500' : 'text-gray-400'}
                        >
                          {current.context.hintUsed ? 'Used' : 'Available'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-3xl bg-black/40 px-4 py-3 text-sm text-white">
                        <span>50/50</span>
                        <span
                          className={current.context.fiftyUsed ? 'text-red-500' : 'text-gray-400'}
                        >
                          {current.context.fiftyUsed ? 'Used' : 'Available'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            </motion.section>
          )}

          {isAnswerState && (
            <motion.section
              key="answer"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.35 }}
              className="rounded-[40px] border border-white/10 bg-[#111111]/90 p-10 shadow-[0_0_40px_rgba(0,0,0,0.28)]"
            >
              <div className="grid gap-8 xl:grid-cols-[1.6fr_0.8fr]">
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-3 rounded-full bg-red-500/10 px-4 py-2 text-xs tracking-[0.35em] text-red-400 uppercase">
                    {current.context.correctAnswer && current.context.feedback.includes('Correct')
                      ? 'Victory'
                      : 'Review'}
                  </div>
                  <h2 className="text-4xl font-black text-white">{current.context.feedback}</h2>
                  <p className="leading-7 text-gray-300">
                    {current.context.timedOut
                      ? 'Time expired on this round. Keep the rhythm and focus on the next question.'
                      : 'Great work moving through the quiz flow. Review the explanation before the next challenge.'}
                  </p>
                  <div className="rounded-3xl bg-white/5 p-6 text-sm text-gray-200">
                    <p className="font-semibold text-white">Correct result</p>
                    <p className="mt-3 break-words text-gray-300">
                      {current.context.correctAnswer}
                    </p>
                  </div>
                  <button
                    onClick={() => send({ type: 'NEXT' })}
                    className="rounded-full bg-red-600 px-8 py-4 font-bold tracking-[0.25em] text-white uppercase transition hover:bg-red-700"
                  >
                    {current.context.currentIndex + 1 < quizQuestions.length
                      ? 'Next Question'
                      : 'See Results'}
                  </button>
                </div>
                <div className="rounded-[32px] border border-white/10 bg-black/40 p-6 text-center">
                  {current.context.feedback.includes('Correct') ? (
                    <Player
                      autoplay
                      loop={false}
                      src={successAnimationUrl}
                      style={{ height: 260, width: 260, margin: '0 auto' }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-3xl bg-white/5 p-8">
                      <p className="text-sm text-gray-300">
                        Keep your momentum. The next challenge is waiting.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.section>
          )}

          {isCompleteState && (
            <motion.section
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35 }}
              className="rounded-[40px] border border-white/10 bg-[#111111]/90 p-10 shadow-[0_0_40px_rgba(0,0,0,0.28)]"
            >
              <div className="space-y-8 text-center">
                <p className="text-sm tracking-[0.35em] text-red-500 uppercase">Quiz Complete</p>
                <h2 className="text-5xl font-black text-white">Final Score</h2>
                <p className="text-8xl font-black text-red-500">{current.context.score}</p>
                <p className="mx-auto max-w-2xl leading-relaxed text-gray-400">
                  You completed the quiz with {current.context.score} out of {quizQuestions.length}{' '}
                  correct answers. Use this experience to reinforce on-chain contract deployment
                  workflows and Soroban shortcuts.
                </p>
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                  <button
                    onClick={() => send({ type: 'RESTART' })}
                    className="rounded-full bg-red-600 px-8 py-4 font-bold tracking-[0.25em] text-white uppercase transition hover:bg-red-700"
                  >
                    Restart Quiz
                  </button>
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="rounded-full border border-white/10 bg-white/5 px-8 py-4 text-sm font-bold tracking-[0.25em] text-white uppercase transition hover:border-red-500/40"
                  >
                    Review Concepts
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
