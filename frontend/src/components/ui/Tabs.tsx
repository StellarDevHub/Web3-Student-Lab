import React from 'react';
import { cn } from '@/lib/utils';

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  children: React.ReactNode;
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
}

export function Tabs({ children, ...props }: TabsProps) {
  return <div {...props}>{children}</div>;
}

export function TabsList({ className, children, ...props }: TabsListProps) {
  return (
    <div
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ className, children, ...props }: TabsTriggerProps) {
  return (
    <button
      className={cn(
        'ring-offset-background focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({ className, children, ...props }: TabsContentProps) {
  return (
    <div
      className={cn(
        'ring-offset-background focus-visible:ring-ring mt-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
