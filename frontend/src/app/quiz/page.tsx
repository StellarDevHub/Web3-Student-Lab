'use client';

import dynamic from 'next/dynamic';
import { QuizSkeleton } from '@/components/ui/skeletons/PageSkeletons';

const QuizEngine = dynamic(() => import('@/components/quiz/QuizEngine'), {
  ssr: false,
  loading: () => <QuizSkeleton />,
});

export default function QuizPage() {
  return <QuizEngine />;
}
