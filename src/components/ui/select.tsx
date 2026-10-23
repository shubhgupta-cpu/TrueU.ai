import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** Native <select> (accessible, keyboard-friendly) with our own arrow, border and focus ring. Width classes go on the wrapper. */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <div className={cn('relative w-full', className)}>
    <select
      ref={ref}
      className="min-h-touch w-full cursor-pointer appearance-none rounded-lg border border-line bg-surface py-2 pl-3 pr-10 text-sm font-medium text-ink shadow-sm transition-colors hover:border-accent/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
    />
  </div>
));
Select.displayName = 'Select';
