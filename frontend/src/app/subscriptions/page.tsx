'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { SubscriptionsSkeleton } from '@/components/ui/skeletons/PageSkeletons';

const SubscriptionDashboard = dynamic(
  () =>
    import('@/components/subscriptions/SubscriptionManager').then((mod) => mod.SubscriptionManager),
  { ssr: false }
);

export default function SubscriptionsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <Suspense fallback={<SubscriptionsSkeleton />}>
        <SubscriptionDashboard />
      </Suspense>
    </div>
  );
}
