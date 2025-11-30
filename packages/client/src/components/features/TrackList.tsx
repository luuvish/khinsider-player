import { TrackRow } from './TrackRow';

interface Track {
  id: number;
  name: string;
  track_number?: number;
  duration?: string;
  file_size?: string;
}

interface TrackListProps {
  tracks: Track[];
  currentTrackId?: number | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track) => void;
}

export function TrackList({
  tracks,
  currentTrackId,
  isPlaying,
  onTrackSelect,
}: TrackListProps) {
  if (tracks.length === 0) {
    return (
      <div className="py-12 text-center text-neutral-400">
        No tracks available
      </div>
    );
  }

  return (
    <div className="divide-y divide-neutral-800/50">
      {/* Header - visible on larger screens */}
      <div className="hidden sm:flex items-center gap-4 px-4 py-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">
        <div className="w-8 text-center">#</div>
        <div className="flex-1">Title</div>
        <div className="w-16">Duration</div>
        <div className="w-16 text-right">Size</div>
      </div>

      {/* Track rows */}
      {tracks.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index}
          isCurrent={track.id === currentTrackId}
          isPlaying={isPlaying && track.id === currentTrackId}
          onClick={() => onTrackSelect(track)}
        />
      ))}
    </div>
  );
}
