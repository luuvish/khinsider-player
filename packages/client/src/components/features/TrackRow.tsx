import { cn } from '@/lib/cn';
import { Play } from '@/lib/icons';
import { PlayingIndicator } from './PlayingIndicator';

interface Track {
  id: number;
  name: string;
  track_number?: number;
  duration?: string;
  file_size?: string;
}

interface TrackRowProps {
  track: Track;
  index: number;
  isPlaying: boolean;
  isCurrent: boolean;
  onClick: () => void;
}

export function TrackRow({
  track,
  index,
  isPlaying,
  isCurrent,
  onClick,
}: TrackRowProps) {
  const trackNumber = track.track_number ?? index + 1;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'group flex items-center gap-4 px-4 py-3 -mx-4 rounded-lg',
        'cursor-pointer transition-all duration-150',
        'hover:bg-neutral-800/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-inset',
        isCurrent && 'bg-accent-500/10'
      )}
    >
      {/* Track Number / Playing Indicator */}
      <div className="w-8 text-center flex-shrink-0">
        {isCurrent && isPlaying ? (
          <PlayingIndicator />
        ) : isCurrent ? (
          <span className="text-sm font-medium text-accent-400">{trackNumber}</span>
        ) : (
          <>
            <span className="text-sm text-neutral-500 group-hover:hidden">
              {trackNumber}
            </span>
            <Play className="h-4 w-4 text-neutral-400 hidden group-hover:block mx-auto" />
          </>
        )}
      </div>

      {/* Track Name */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'truncate transition-colors',
            isCurrent ? 'text-accent-400 font-medium' : 'text-neutral-200'
          )}
        >
          {track.name}
        </p>
      </div>

      {/* Duration & File Size */}
      <div className="flex items-center gap-6 text-sm text-neutral-500 flex-shrink-0">
        {track.duration && (
          <span className="tabular-nums">{track.duration}</span>
        )}
        {track.file_size && (
          <span className="hidden sm:inline w-16 text-right">{track.file_size}</span>
        )}
      </div>
    </div>
  );
}
