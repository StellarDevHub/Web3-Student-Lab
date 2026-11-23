'use client';

import dynamic from 'next/dynamic';

const PeerReviewDashboard = dynamic(() => import('@/components/review/PeerReviewDashboard'), {
  ssr: false,
});

export default function PeerReviewPage() {
  return <PeerReviewDashboard />;
}
