import React from 'react';

interface WithSkeletonProps {
  isLoading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}

export function WithSkeleton({ isLoading, skeleton, children }: WithSkeletonProps) {
  if (isLoading) {
    return <>{skeleton}</>;
  }
  return <>{children}</>;
}
