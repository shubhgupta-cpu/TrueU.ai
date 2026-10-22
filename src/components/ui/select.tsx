import * as React from 'react';
import { cn } from '@/lib/utils';

/** Native <select>: accessible and keyboard-friendly by default. */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex min-h-touch w-full rounded-md border border-line bg-surface px-3 text-sm text-ink disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';
