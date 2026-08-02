'use client';

import { useAuth } from '@/contexts/AuthContext';
import { analyticsAPI } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function CertificateAnalyticsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
      return;
    }

    async function loadAnalytics() {
      try {
        const data = await analyticsAPI.getUserAnalytics(user!.id);
        setAnalytics(data);
      } catch (error) {
        console.error('Failed to load analytics:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadAnalytics();
  }, [user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-black">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-red-600/30 border-t-red-600"></div>
          <p className="font-mono text-sm tracking-widest text-red-500 uppercase">
            Loading Analytics...
          </p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-black">
        <div className="text-center">
          <p className="font-mono text-sm tracking-widest text-red-500 uppercase">
            No analytics data available
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black p-8 text-white md:p-12">
      {/* Background Effect */}
      <div className="pointer-events-none absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-red-600/10 blur-[100px]"></div>

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-12 border-l-4 border-red-600 py-2 pl-6">
          <h1 className="mb-2 text-4xl font-black tracking-tight uppercase md:text-5xl">
            Certificate <span className="text-red-500">Analytics</span>
          </h1>
          <p className="font-mono text-lg text-sm font-light tracking-wide text-gray-400 uppercase">
            Performance metrics for Operator: <span className="text-white">{user?.name}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-bold tracking-widest text-white uppercase">
              Total Certificates
            </h3>
            <p className="text-3xl font-black text-white">{analytics.certificatesCount || 0}</p>
          </div>
          
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-bold tracking-widest text-white uppercase">
              Active Certificates
            </h3>
            <p className="text-3xl font-black text-white">{analytics.certificates?.filter((c: any) => c.status === 'ACTIVE')?.length || 0}</p>
          </div>
          
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-bold tracking-widest text-white uppercase">
              Revoked Certificates
            </h3>
            <p className="text-3xl font-black text-white">{analytics.certificates?.filter((c: any) => c.status === 'REVOKED')?.length || 0}</p>
          </div>
          
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-bold tracking-widest text-white uppercase">
              Revocation Rate
            </h3>
            <p className="text-3xl font-black text-white">{analytics.certificates ? ((analytics.certificates.filter((c: any) => c.status === 'REVOKED').length / analytics.certificates.length) * 100).toFixed(1) + '%' : '0%'}</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-xl">
          <h3 className="mb-6 border-b border-white/10 pb-4 text-sm font-bold tracking-widest text-white uppercase">
            Certificate Status Distribution
          </h3>
          
          <div className="space-y-4">
            {analytics.certificates && analytics.certificates.length > 0 ? (
              Object.entries(
                analytics.certificates.reduce((acc: Record<string, number>, cert: any) => {
                  acc[cert.status] = (acc[cert.status] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded border border-white/5 bg-black p-3">
                  <span className="text-gray-500 capitalize">{status}</span>
                  <span className="font-bold text-white">{count}</span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-between rounded border border-white/5 bg-black p-3">
                <span className="text-gray-500">No certificates</span>
                <span className="font-bold text-white">0</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}