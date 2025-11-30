import { useState } from 'react';
import { Star } from '@/lib/icons';
import { cn } from '@/lib/cn';

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: () => Promise<void> | void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function FavoriteButton({
  isFavorite,
  onToggle,
  size = 'md',
  className,
}: FavoriteButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await onToggle();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
        'disabled:opacity-50 disabled:pointer-events-none',
        'active:scale-95',
        {
          'h-8 w-8': size === 'sm',
          'h-10 w-10': size === 'md',
          'h-12 w-12': size === 'lg',
        },
        isFavorite
          ? 'text-warning hover:text-warning/80'
          : 'text-neutral-400 hover:text-warning',
        className
      )}
    >
      <Star
        className={cn(
          'transition-transform',
          {
            'h-4 w-4': size === 'sm',
            'h-5 w-5': size === 'md',
            'h-6 w-6': size === 'lg',
          },
          isFavorite && 'fill-current',
          isLoading && 'animate-pulse'
        )}
      />
    </button>
  );
}
