import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'success' | 'warning';
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          // Base styles
          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',

          // Variants
          {
            'bg-neutral-800 text-neutral-300': variant === 'default',
            'bg-accent-900/50 text-accent-400': variant === 'accent',
            'bg-success/20 text-success': variant === 'success',
            'bg-warning/20 text-warning': variant === 'warning',
          },

          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };
