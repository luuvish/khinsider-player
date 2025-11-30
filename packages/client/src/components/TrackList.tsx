import { usePlayerStore } from '@/stores/playerStore';
import clsx from 'clsx';

interface Track {
  id: number;
  trackNumber: number;
  name: string;
  duration: string;
  pageUrl: string;
  fileSize: string;
  isPlayed: boolean;
  isDownloaded: boolean;
}

interface Album {
  id: number;
  title: string;
  url: string;
  year: string;
  platform: string;
  trackCount: number;
  isFavorite: boolean;
  isDownloaded: boolean;
  slug: string;
}

interface TrackListProps {
  tracks: Track[];
  album?: Album;
}

export function TrackList({ tracks, album }: TrackListProps) {
  const { currentTrack, isPlaying, play, pause, resume } = usePlayerStore();

  const handleTrackClick = (track: Track) => {
    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    } else {
      play(track, album, tracks);
    }
  };

  return (
    <div className="divide-y divide-slate-700">
      {tracks.map((track) => {
        const isCurrent = currentTrack?.id === track.id;

        return (
          <div
            key={track.id}
            onClick={() => handleTrackClick(track)}
            className={clsx(
              'flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors',
              isCurrent ? 'bg-primary-900/30' : 'hover:bg-slate-700/50'
            )}
          >
            <div className="w-8 text-center text-sm text-slate-400">
              {isCurrent && isPlaying ? (
                <svg className="w-4 h-4 mx-auto text-primary-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : isCurrent ? (
                <svg className="w-4 h-4 mx-auto text-primary-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              ) : (
                track.trackNumber
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className={clsx(
                'truncate',
                isCurrent && 'text-primary-400 font-medium'
              )}>
                {track.name}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-slate-400">
              {track.isPlayed && (
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
              )}
              <span className="w-12 text-right">{track.duration}</span>
              <span className="w-16 text-right">{track.fileSize}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
