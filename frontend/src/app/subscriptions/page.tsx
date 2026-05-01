"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useWallet } from "@/contexts/WalletContext";

const SubscriptionDashboard = dynamic(
  () => import("@/components/subscriptions/SubscriptionDashboard"),
  { ssr: false }
);

export default function SubscriptionsPage() {
  const { isConnected } = useWallet();

  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>}>
        <SubscriptionDashboard />
      </Suspense>
    </div>
  );
}
