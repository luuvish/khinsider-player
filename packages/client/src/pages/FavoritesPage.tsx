import { useState, useEffect, useRef } from 'react';
import { albumsApi } from '@/api/client';
import { logger } from '@/utils/logger';
import { AlbumCard } from '@/components/features';
import { Skeleton } from '@/components/ui';
import { Star, AlertCircle } from '@/lib/icons';

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

export function FavoritesPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadFavorites();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const loadFavorites = async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      const { data } = await albumsApi.getFavorites(abortControllerRef.current.signal);
      setAlbums(data.albums);
    } catch (err) {
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
      <div className="py-8 sm:py-12">
        <div className="flex items-center gap-3 mb-8">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="w-12 h-12 text-error mb-4" />
        <p className="text-lg text-neutral-200 mb-2">Unable to load favorites</p>
        <p className="text-sm text-neutral-500">{error}</p>
        <button
          onClick={loadFavorites}
          className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <section className="py-8 sm:py-12 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 rounded-full bg-warning/10">
          <Star className="w-5 h-5 text-warning fill-current" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">
            Favorites
          </h1>
          <p className="text-sm text-neutral-400">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'}
          </p>
        </div>
      </div>

      {/* Albums Grid */}
      {albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 rounded-full bg-neutral-800/50 mb-4">
            <Star className="w-12 h-12 text-neutral-700" />
          </div>
          <p className="text-lg text-neutral-300 mb-2">No favorites yet</p>
          <p className="text-sm text-neutral-500 max-w-sm">
            Browse albums and click the star icon to add them to your favorites
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {albums.map((album) => (
            <AlbumCard
              key={album.id}
              album={{
                id: album.id,
                slug: album.slug,
                title: album.title,
                year: album.year,
                platform: album.platform,
                track_count: album.trackCount,
                is_favorite: album.isFavorite,
                is_downloaded: album.isDownloaded,
                cover_url: album.cover_url,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
