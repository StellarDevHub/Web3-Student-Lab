'use client';

import dynamic from 'next/dynamic';
import { ChartSkeleton } from '../common/Skeleton';

// Dynamically import D3 charts to reduce initial bundle size
export const ThemedLineChart = dynamic(
  () => import('./ThemedCharts').then((mod) => mod.ThemedLineChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

export const ThemedBarChart = dynamic(
  () => import('./ThemedCharts').then((mod) => mod.ThemedBarChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);
