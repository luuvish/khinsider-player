import { cn } from '@/lib/cn';

interface PlayingIndicatorProps {
  className?: string;
}

export function PlayingIndicator({ className }: PlayingIndicatorProps) {
  return (
    <div
      className={cn('flex items-end justify-center gap-0.5 h-4 w-4', className)}
      aria-label="Now playing"
    >
      <div
        className="w-1 bg-accent-400 rounded-full animate-playing"
        style={{ animationDelay: '0ms', height: '100%' }}
      />
      <div
        className="w-1 bg-accent-400 rounded-full animate-playing"
        style={{ animationDelay: '150ms', height: '75%' }}
      />
      <div
        className="w-1 bg-accent-400 rounded-full animate-playing"
        style={{ animationDelay: '300ms', height: '100%' }}
      />
    </div>
  );
}
