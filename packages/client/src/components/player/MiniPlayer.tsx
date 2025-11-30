import { IconButton } from '@/components/ui';
import { Play, Pause, ChevronUp, Disc } from '@/lib/icons';

interface Track {
  id: number;
  name: string;
}

interface Album {
  id: number;
  title: string;
  cover_url?: string;
}

interface MiniPlayerProps {
  track: Track | null;
  album: Album | null;
  isPlaying: boolean;
  isLoading: boolean;
  onPlayPause: () => void;
  onExpand?: () => void;
}

export function MiniPlayer({
  track,
  album,
  isPlaying,
  isLoading,
  onPlayPause,
  onExpand,
}: MiniPlayerProps) {
  if (!track) {
    return (
      <div className="bg-neutral-900 border-t border-neutral-800 px-4 py-3">
        <p className="text-sm text-neutral-400 text-center">Select a track to play</p>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 border-t border-neutral-800 px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Album Art */}
        <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {album?.cover_url ? (
            <img
              src={album.cover_url}
              alt={album.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <Disc className="w-5 h-5 text-neutral-600" />
          )}
        </div>

        {/* Track Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-neutral-100 truncate">
            {track.name}
          </p>
          {album && (
            <p className="text-xs text-neutral-400 truncate">
              {album.title}
            </p>
          )}
        </div>

        {/* Controls */}
        <IconButton
          icon={isPlaying ? Pause : Play}
          onClick={onPlayPause}
          label={isPlaying ? 'Pause' : 'Play'}
          size="sm"
          loading={isLoading}
        />

        {onExpand && (
          <IconButton
            icon={ChevronUp}
            onClick={onExpand}
            label="Expand player"
            size="sm"
          />
        )}
      </div>
    </div>
  );
}
