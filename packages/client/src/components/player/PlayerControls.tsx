import { IconButton } from '@/components/ui';
import { Play, Pause, SkipBack, SkipForward, Square, Loader2 } from '@/lib/icons';

interface PlayerControlsProps {
  isPlaying: boolean;
  isLoading: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onStop: () => void;
  hasTrack: boolean;
}

export function PlayerControls({
  isPlaying,
  isLoading,
  onPlayPause,
  onNext,
  onPrevious,
  onStop,
  hasTrack,
}: PlayerControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <IconButton
        icon={SkipBack}
        onClick={onPrevious}
        label="Previous track"
        size="sm"
        disabled={!hasTrack}
      />

      <IconButton
        icon={isLoading ? Loader2 : isPlaying ? Pause : Play}
        onClick={onPlayPause}
        label={isPlaying ? 'Pause' : 'Play'}
        size="lg"
        variant="accent"
        disabled={!hasTrack}
        loading={isLoading}
      />

      <IconButton
        icon={SkipForward}
        onClick={onNext}
        label="Next track"
        size="sm"
        disabled={!hasTrack}
      />

      <IconButton
        icon={Square}
        onClick={onStop}
        label="Stop"
        size="sm"
        disabled={!hasTrack}
      />
    </div>
  );
}
