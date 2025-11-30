import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { albumsApi } from '@/api/client';
import { usePlayerStore } from '@/stores/playerStore';
import { TrackList, FavoriteButton } from '@/components/features';
import { Button, Badge, Skeleton } from '@/components/ui';
import { ArrowLeft, Play, RefreshCw, AlertCircle, Disc } from '@/lib/icons';
import { logger } from '@/utils/logger';

const MAX_ALBUM_ID = 2147483647;

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
  cover_url?: string;
}

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

export function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const [album, setAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { currentTrack, isPlaying, play } = usePlayerStore();

  const getValidAlbumId = useCallback((): number | null => {
    if (!id) return null;
    const albumId = parseInt(id, 10);
    if (isNaN(albumId) || albumId <= 0 || albumId > MAX_ALBUM_ID) {
      return null;
    }
    return albumId;
  }, [id]);

  const loadAlbum = useCallback(async (signal: AbortSignal) => {
    const albumId = getValidAlbumId();
    if (!albumId) {
      setError('Invalid album ID');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const [albumRes, tracksRes] = await Promise.all([
        albumsApi.getById(albumId),
        albumsApi.getTracks(albumId)
      ]);

      if (signal.aborted) return;

      setAlbum(albumRes.data.album);
      setTracks(tracksRes.data.tracks);
    } catch (err) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load album: ${message}`);
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [getValidAlbumId]);

  useEffect(() => {
    const abortController = new AbortController();

    if (id) {
      loadAlbum(abortController.signal);
    }

    return () => {
      abortController.abort();
    };
  }, [id, loadAlbum]);

  const handleRefreshTracks = async () => {
    const albumId = getValidAlbumId();
    if (!albumId) return;

    try {
      setIsRefreshing(true);
      const { data } = await albumsApi.getTracks(albumId, true);
      setTracks(data.tracks);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to refresh tracks: ${message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!album) return;
    try {
      const { data } = await albumsApi.toggleFavorite(album.id);
      setAlbum({ ...album, isFavorite: data.isFavorite });
    } catch (err) {
      logger.error('Failed to toggle favorite', err);
    }
  };

  const handlePlayAll = () => {
    if (!album || tracks.length === 0) return;
    play(tracks[0], album, tracks);
  };

  const handleTrackSelect = (track: Track) => {
    if (!album) return;
    play(track, album, tracks);
  };

  if (isLoading) {
    return (
      <div className="py-8 sm:py-12">
        <Skeleton className="h-5 w-32 mb-6" />
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 mb-8">
          <Skeleton className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl mx-auto sm:mx-0" />
          <div className="flex-1 space-y-4 text-center sm:text-left">
            <Skeleton className="h-8 w-3/4 mx-auto sm:mx-0" />
            <div className="flex gap-2 justify-center sm:justify-start">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
            <div className="flex gap-3 justify-center sm:justify-start">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="w-12 h-12 text-error mb-4" />
        <p className="text-lg text-neutral-200 mb-2">Unable to load album</p>
        <p className="text-sm text-neutral-500">{error || 'Album not found'}</p>
        <Link
          to="/"
          className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-colors"
        >
          Go back home
        </Link>
      </div>
    );
  }

  return (
    <section className="py-8 sm:py-12 animate-fade-in">
      {/* Back Link */}
      <nav className="mb-6">
        <Link
          to={`/year/${album.year}`}
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {album.year}
        </Link>
      </nav>

      {/* Album Header */}
      <header className="mb-8 sm:mb-12">
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
          {/* Album Art */}
          <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl bg-neutral-800 flex items-center justify-center flex-shrink-0 mx-auto sm:mx-0 overflow-hidden">
            {album.cover_url ? (
              <img
                src={album.cover_url}
                alt={album.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Disc className="w-16 h-16 text-neutral-700" />
            )}
          </div>

          {/* Album Info */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-100">
              {album.title}
            </h1>

            <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-3">
              <Badge>{album.platform}</Badge>
              <Badge>{album.year}</Badge>
              <span className="text-sm text-neutral-400">
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
              </span>
            </div>

            <div className="mt-6 flex flex-wrap justify-center sm:justify-start gap-3">
              <Button
                variant="primary"
                icon={Play}
                onClick={handlePlayAll}
                disabled={tracks.length === 0}
              >
                Play All
              </Button>

              <FavoriteButton
                isFavorite={album.isFavorite}
                onToggle={handleToggleFavorite}
                size="md"
              />

              <Button
                variant="ghost"
                icon={RefreshCw}
                onClick={handleRefreshTracks}
                loading={isRefreshing}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Track List */}
      <TrackList
        tracks={tracks.map((t) => ({
          id: t.id,
          name: t.name,
          track_number: t.trackNumber,
          duration: t.duration,
          file_size: t.fileSize,
        }))}
        currentTrackId={currentTrack?.id}
        isPlaying={isPlaying}
        onTrackSelect={(track) => {
          const fullTrack = tracks.find((t) => t.id === track.id);
          if (fullTrack) {
            handleTrackSelect(fullTrack);
          }
        }}
      />
    </section>
  );
}
