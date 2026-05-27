'use client';

import dynamic from 'next/dynamic';

const QuizEngine = dynamic(() => import('@/components/quiz/QuizEngine'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] text-zinc-500">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
        <p className="text-xs tracking-widest uppercase">Loading Quiz Arena...</p>
      </div>
    </div>
  ),
});

export default function QuizPage() {
  return <QuizEngine />;
}
