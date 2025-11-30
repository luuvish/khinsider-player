import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Loader2, type LucideIcon } from '../../lib/icons';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  variant?: 'default' | 'accent' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  label: string; // Required for accessibility
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      icon: Icon,
      variant = 'default',
      size = 'md',
      loading = false,
      disabled,
      label,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        aria-label={label}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center rounded-full',
          'transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950',
          'disabled:pointer-events-none disabled:opacity-50',
          'active:scale-[0.95]',

          // Variants
          {
            'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800': variant === 'default',
            'bg-accent-600 text-white hover:bg-accent-500': variant === 'accent',
            'text-neutral-400 hover:text-neutral-100': variant === 'ghost',
          },

          // Sizes
          {
            'h-8 w-8': size === 'sm',
            'h-10 w-10': size === 'md',
            'h-12 w-12': size === 'lg',
          },

          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <Loader2
            className={cn('animate-spin', {
              'h-4 w-4': size === 'sm',
              'h-5 w-5': size === 'md',
              'h-6 w-6': size === 'lg',
            })}
          />
        ) : (
          <Icon
            className={cn({
              'h-4 w-4': size === 'sm',
              'h-5 w-5': size === 'md',
              'h-6 w-6': size === 'lg',
            })}
          />
        )}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export { IconButton };
