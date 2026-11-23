import React from 'react';
import { cn } from '@/lib/utils';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

export function Label({ className, children, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        'text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
}
