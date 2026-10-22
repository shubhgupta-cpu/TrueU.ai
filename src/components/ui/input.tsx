import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex min-h-touch w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
