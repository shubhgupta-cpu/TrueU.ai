import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-touch items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-white hover:bg-accent/90',
        outline: 'border border-line bg-surface text-ink hover:bg-ground',
        ghost: 'text-ink hover:bg-ground',
        danger: 'bg-danger text-white hover:bg-danger/90',
        link: 'min-h-0 px-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: '',
        sm: 'px-3 text-xs',
        icon: 'w-touch px-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
