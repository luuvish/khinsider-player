import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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

export function FavoritesPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadFavorites();

    return () => {
      // Cleanup: abort pending request on unmount
      abortControllerRef.current?.abort();
    };
  }, []);

  const loadFavorites = async () => {
    // Abort any existing request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      const { data } = await albumsApi.getFavorites(abortControllerRef.current.signal);
      setAlbums(data.albums);
    } catch (err) {
      // Don't set error for aborted requests
      if (err instanceof Error && err.name === 'CanceledError') {
        return;
      }
      setError('Failed to load favorites');
      logger.error('Failed to load favorites:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading favorites...</div>
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
      <h1 className="text-2xl font-bold mb-6">Favorites</h1>

      {albums.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          <p>No favorite albums yet.</p>
          <p className="mt-2">Browse albums and click the star to add favorites.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {albums.map((album) => (
            <Link
              key={album.id}
              to={`/album/${album.id}`}
              className="card p-4 hover:bg-slate-700/50 transition-colors flex items-center gap-4"
            >
              <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{album.title}</div>
                <div className="text-sm text-slate-400">
                  {album.platform} - {album.year}
                </div>
              </div>
              <div className="text-sm text-slate-400">
                {album.trackCount || '-'} tracks
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
