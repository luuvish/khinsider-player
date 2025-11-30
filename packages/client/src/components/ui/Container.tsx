import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const Container = forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size = 'lg', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'mx-auto w-full px-4 sm:px-6 lg:px-8',

          {
            'max-w-3xl': size === 'sm',
            'max-w-4xl': size === 'md',
            'max-w-5xl': size === 'lg',
            'max-w-6xl': size === 'xl',
            '': size === 'full',
          },

          className
        )}
        {...props}
      />
    );
  }
);

Container.displayName = 'Container';

export { Container };
