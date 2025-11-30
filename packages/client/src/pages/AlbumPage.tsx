import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { albumsApi } from '@/api/client';
import { TrackList } from '@/components/TrackList';
import { logger } from '@/utils/logger';

// Validation constants
const MAX_ALBUM_ID = 2147483647; // Max SQLite integer

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
  const [error, setError] = useState<string | null>(null);

  // Validate and parse album ID
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

      // Check if request was aborted
      if (signal.aborted) return;

      setAlbum(albumRes.data.album);
      setTracks(tracksRes.data.tracks);
    } catch (err) {
      // Don't update state if aborted
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
      setIsLoading(true);
      const { data } = await albumsApi.getTracks(albumId, true);
      setTracks(data.tracks);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to refresh tracks: ${message}`);
    } finally {
      setIsLoading(false);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading album...</div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400">{error || 'Album not found'}</div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-32">
      <div className="mb-6">
        <Link to={`/year/${album.year}`} className="text-slate-400 hover:text-white">
          &larr; Back to {album.year}
        </Link>
      </div>

      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">{album.title}</h1>
            <div className="flex items-center gap-4 text-slate-400">
              <span>{album.platform}</span>
              <span>{album.year}</span>
              <span>{tracks.length} tracks</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleFavorite}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              title={album.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg
                className={`w-6 h-6 ${album.isFavorite ? 'text-yellow-500' : 'text-slate-400'}`}
                fill={album.isFavorite ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
            <button onClick={handleRefreshTracks} className="btn btn-secondary">
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <TrackList tracks={tracks} album={album} />
      </div>
    </div>
  );
}
