import React from 'react';
import { cn } from '@/lib/utils';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
  children: React.ReactNode;
}

export function Alert({ className, variant = 'default', children, ...props }: AlertProps) {
  const baseClasses =
    'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground';

  const variants = {
    default: 'bg-background text-foreground',
    destructive:
      'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
  };

  return (
    <div role="alert" className={cn(baseClasses, variants[variant], className)} {...props}>
      {children}
    </div>
  );
}

export function AlertTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5 className={cn('mb-1 leading-none font-medium tracking-tight', className)} {...props}>
      {children}
    </h5>
  );
}

export function AlertDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props}>
      {children}
    </div>
  );
}
