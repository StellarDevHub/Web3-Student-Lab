import React, { useRef, createContext, useContext, useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { KEYS } from '@/lib/keyboard-navigation';

interface DialogContextValue {
  dialogId: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);

const useDialogContext = (): DialogContextValue => {
  const context = useContext(DialogContext);
  if (!context) {
    return { dialogId: `dialog-${useId()}` };
  }
  return context;
};

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  useFocusTrap(containerRef, {
    enabled: !!open,
    initialFocus: !!open,
    returnFocusOnDeactivate: true,
    onEscape: () => onOpenChange?.(false),
  });

  if (!open) return null;

  const handleBackdropKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === KEYS.ESCAPE) {
      e.stopPropagation();
      onOpenChange?.(false);
    }
  };

  return (
    <DialogContext.Provider value={{ dialogId }}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-description`}
      >
        <div
          className="fixed inset-0 bg-black/50"
          onClick={() => onOpenChange?.(false)}
          onKeyDown={handleBackdropKeyDown}
          aria-hidden="true"
        />
        <div
          ref={containerRef}
          className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
}

export function DialogHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props}>
      {children}
    </div>
  );
}

export function DialogTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  const { dialogId } = useDialogContext();
  return (
    <h3 id={`${dialogId}-title`} className={cn('text-lg leading-none font-semibold tracking-tight', className)} {...props}>
      {children}
    </h3>
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('text-muted-foreground text-sm', className)} {...props}>
      {children}
    </div>
  );
}

export function DialogDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { dialogId } = useDialogContext();
  return (
    <p id={`${dialogId}-description`} className={cn('text-sm text-muted-foreground', className)} {...props}>
      {children}
    </p>
  );
}

export const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  return <button ref={ref} className={className} {...props} />;
});
DialogTrigger.displayName = 'DialogTrigger';
