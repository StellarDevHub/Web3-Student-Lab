import * as React from 'react';
import { cn } from '@/lib/utils';

const SelectContext = React.createContext<any>({});

const Select = ({ value, onValueChange, children, className }: any) => {
  const [open, setOpen] = React.useState(false);
  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      <div className={cn('relative', className)} onClick={() => setOpen(!open)}>
        {children}
      </div>
    </SelectContext.Provider>
  );
};

const SelectTrigger = React.forwardRef<HTMLDivElement, any>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SelectTrigger.displayName = 'SelectTrigger';

const SelectValue = React.forwardRef<HTMLSpanElement, any>(
  ({ placeholder, children, ...props }, ref) => {
    const { value } = React.useContext(SelectContext);
    return (
      <span ref={ref} {...props}>
        {value || placeholder || children}
      </span>
    );
  }
);
SelectValue.displayName = 'SelectValue';

const SelectContent = React.forwardRef<HTMLDivElement, any>(
  ({ children, className, ...props }, ref) => {
    const { open } = React.useContext(SelectContext);
    if (!open) return null;
    return (
      <div
        ref={ref}
        className={cn(
          'absolute top-full left-0 mt-1 w-full bg-background border rounded-md shadow-md z-50 p-1',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef<HTMLDivElement, any>(
  ({ className, value, children, ...props }, ref) => {
    const { onValueChange, setOpen } = React.useContext(SelectContext);
    return (
      <div
        ref={ref}
        className={cn(
          'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-white hover:bg-zinc-800',
          className
        )}
        onClick={(e) => {
          e.stopPropagation();
          onValueChange(value);
          setOpen(false);
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SelectItem.displayName = 'SelectItem';

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
