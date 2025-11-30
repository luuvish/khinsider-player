import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { albumsApi } from '@/api/client';
import { logger } from '@/utils/logger';
import { AlbumCard } from '@/components/features';
import { Button, Skeleton } from '@/components/ui';
import { ArrowLeft, RefreshCw, AlertCircle } from '@/lib/icons';

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

export function YearPage() {
  const { year } = useParams<{ year: string }>();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (year) {
      loadAlbums();
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [year]);

  const loadAlbums = async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      const { data } = await albumsApi.getByYear(year!, false, abortControllerRef.current.signal);
      setAlbums(data.albums);
    } catch (err) {
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
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setIsRefreshing(true);
      const { data } = await albumsApi.getByYear(year!, true, abortControllerRef.current.signal);
      setAlbums(data.albums);
    } catch (err) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return;
      }
      setError('Failed to refresh albums');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-8">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 15 }).map((_, i) => (
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
        <p className="text-lg text-neutral-200 mb-2">Unable to load albums</p>
        <p className="text-sm text-neutral-500">{error}</p>
        <button
          onClick={loadAlbums}
          className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <section className="py-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-neutral-400 hover:text-neutral-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-neutral-100">
              Albums from {year}
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              {albums.length} {albums.length === 1 ? 'album' : 'albums'}
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          icon={RefreshCw}
          onClick={handleRefresh}
          loading={isRefreshing}
        >
          Refresh
        </Button>
      </div>

      {/* Albums Grid */}
      {albums.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-neutral-400">No albums found for {year}</p>
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
