import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { albumsApi } from '@/api/client';
import { logger } from '@/utils/logger';

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

export function YearPage() {
  const { year } = useParams<{ year: string }>();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (year) {
      loadAlbums();
    }

    return () => {
      // Cleanup: abort pending request on unmount
      abortControllerRef.current?.abort();
    };
  }, [year]);

  const loadAlbums = async () => {
    // Abort any existing request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      const { data } = await albumsApi.getByYear(year!, false, abortControllerRef.current.signal);
      setAlbums(data.albums);
    } catch (err) {
      // Don't set error for aborted requests
      if (err instanceof Error && err.name === 'CanceledError') {
        return;
      }
      setError('Failed to load albums');
      logger.error('Failed to load albums:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    // Abort any existing request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      const { data } = await albumsApi.getByYear(year!, true, abortControllerRef.current.signal);
      setAlbums(data.albums);
    } catch (err) {
      // Don't set error for aborted requests
      if (err instanceof Error && err.name === 'CanceledError') {
        return;
      }
      setError('Failed to refresh albums');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading albums...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-slate-400 hover:text-white">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-bold">Albums from {year}</h1>
          <span className="text-slate-400">({albums.length} albums)</span>
        </div>
        <button onClick={handleRefresh} className="btn btn-secondary">
          Refresh
        </button>
      </div>

      <div className="grid gap-2">
        {albums.map((album) => (
          <Link
            key={album.id}
            to={`/album/${album.id}`}
            className="card p-4 hover:bg-slate-700/50 transition-colors flex items-center gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{album.title}</div>
              <div className="text-sm text-slate-400">{album.platform}</div>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              {album.isFavorite && (
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              )}
              <span>{album.trackCount || '-'} tracks</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
