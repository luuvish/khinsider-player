import { Slider } from '@/components/ui';

interface PlayerProgressProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function PlayerProgress({
  currentTime,
  duration,
  onSeek,
  disabled = false,
}: PlayerProgressProps) {
  return (
    <div className="flex items-center gap-3 w-full max-w-md">
      <span className="text-xs text-neutral-400 w-10 text-right tabular-nums">
        {formatTime(currentTime)}
      </span>

      <Slider
        value={currentTime}
        max={duration || 100}
        min={0}
        step={1}
        onChange={onSeek}
        onChangeEnd={onSeek}
        disabled={disabled || !duration}
        size="sm"
        label="Track progress"
        className="flex-1"
      />

      <span className="text-xs text-neutral-400 w-10 tabular-nums">
        {formatTime(duration)}
      </span>
    </div>
  );
}
