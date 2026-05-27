'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const SubscriptionDashboard = dynamic(
  () =>
    import('@/components/subscriptions/SubscriptionManager').then((mod) => mod.SubscriptionManager),
  { ssr: false }
);

export default function SubscriptionsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
          </div>
        }
      >
        <SubscriptionDashboard />
      </Suspense>
    </div>
  );
}
