import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Loader2, type LucideIcon } from '../../lib/icons';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  children?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      icon: Icon,
      iconPosition = 'left',
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
          'transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950',
          'disabled:pointer-events-none disabled:opacity-50',
          'active:scale-[0.98]',

          // Variants
          {
            // Primary
            'bg-accent-600 text-white hover:bg-accent-500': variant === 'primary',

            // Secondary
            'bg-neutral-800 text-neutral-100 hover:bg-neutral-700': variant === 'secondary',

            // Ghost
            'bg-transparent text-neutral-100 hover:bg-neutral-800': variant === 'ghost',

            // Outline
            'border border-neutral-700 bg-transparent text-neutral-100 hover:bg-neutral-800 hover:border-neutral-600':
              variant === 'outline',
          },

          // Sizes
          {
            'h-8 px-3 text-sm': size === 'sm',
            'h-10 px-4 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
          },

          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          Icon && iconPosition === 'left' && <Icon className="h-4 w-4" />
        )}
        {children}
        {!loading && Icon && iconPosition === 'right' && <Icon className="h-4 w-4" />}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
