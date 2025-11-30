import { Disc } from '@/lib/icons';

interface Track {
  id: number;
  name: string;
}

interface Album {
  id: number;
  title: string;
  cover_url?: string;
}

interface PlayerInfoProps {
  track: Track | null;
  album: Album | null;
}

export function PlayerInfo({ track, album }: PlayerInfoProps) {
  if (!track) {
    return (
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-14 h-14 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0">
          <Disc className="w-6 h-6 text-neutral-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-neutral-400">Select a track to play</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 min-w-0">
      {/* Album Art */}
      <div className="w-14 h-14 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {album?.cover_url ? (
          <img
            src={album.cover_url}
            alt={album.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <Disc className="w-6 h-6 text-neutral-600" />
        )}
      </div>

      {/* Track Info */}
      <div className="min-w-0">
        <p className="font-medium text-neutral-100 truncate">
          {track.name}
        </p>
        {album && (
          <p className="text-sm text-neutral-400 truncate">
            {album.title}
          </p>
        )}
      </div>
    </div>
  );
}
