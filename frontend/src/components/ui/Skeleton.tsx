import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  borderRadius?: string;
}

export function Skeleton({ className = '', borderRadius, style, ...props }: SkeletonProps) {
  const mergedStyle = borderRadius ? { borderRadius, ...style } : style;
  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer rounded-md ${className}`}
      style={mergedStyle}
      {...props}
    />
  );
}
