import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Search, type LucideIcon } from '../../lib/icons';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon: Icon, error, type = 'text', ...props }, ref) => {
    return (
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
        )}
        <input
          ref={ref}
          type={type}
          className={cn(
            // Base styles
            'w-full rounded-lg border bg-neutral-800 text-neutral-100',
            'placeholder:text-neutral-500',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50',

            // Default border
            error ? 'border-error' : 'border-neutral-700',

            // Icon padding
            Icon ? 'pl-10 pr-4' : 'px-4',

            // Height
            'h-10 text-sm',

            className
          )}
          aria-invalid={error ? 'true' : undefined}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-error">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// SearchInput variant for convenience
export type SearchInputProps = Omit<InputProps, 'icon' | 'type'>;

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, placeholder = 'Search...', ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="search"
        icon={Search}
        placeholder={placeholder}
        className={className}
        {...props}
      />
    );
  }
);

SearchInput.displayName = 'SearchInput';

export { Input, SearchInput };
