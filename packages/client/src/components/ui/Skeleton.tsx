import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'text' | 'circle' | 'rounded';
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'animate-pulse bg-neutral-800',

          {
            'rounded-md': variant === 'default',
            'rounded h-4': variant === 'text',
            'rounded-full': variant === 'circle',
            'rounded-lg': variant === 'rounded',
          },

          className
        )}
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

// Pre-built skeleton patterns
const SkeletonText = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <Skeleton
      ref={ref}
      variant="text"
      className={cn('w-full', className)}
      {...props}
    />
  )
);

SkeletonText.displayName = 'SkeletonText';

const SkeletonAvatar = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <Skeleton
      ref={ref}
      variant="circle"
      className={cn('h-10 w-10', className)}
      {...props}
    />
  )
);

SkeletonAvatar.displayName = 'SkeletonAvatar';

const SkeletonCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-3', className)} {...props}>
      <Skeleton variant="rounded" className="h-48 w-full" />
      <SkeletonText className="w-3/4" />
      <SkeletonText className="w-1/2" />
    </div>
  )
);

SkeletonCard.displayName = 'SkeletonCard';

export { Skeleton, SkeletonText, SkeletonAvatar, SkeletonCard };
