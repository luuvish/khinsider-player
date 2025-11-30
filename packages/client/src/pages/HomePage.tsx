import { useState, useEffect, useRef } from 'react';
import { albumsApi } from '@/api/client';
import { logger } from '@/utils/logger';
import { YearCard } from '@/components/features';
import { Skeleton } from '@/components/ui';
import { AlertCircle } from '@/lib/icons';

interface YearInfo {
  year: string;
  albumCount: number;
}

export function HomePage() {
  const [years, setYears] = useState<YearInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadYears();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const loadYears = async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      const { data } = await albumsApi.getYears(abortControllerRef.current.signal);
      setYears(data.years);
    } catch (err) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return;
      }
      setError('Failed to load years');
      logger.error('Failed to load years:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12">
        <Skeleton className="h-8 w-48 mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="w-12 h-12 text-error mb-4" />
        <p className="text-lg text-neutral-200 mb-2">Unable to load years</p>
        <p className="text-sm text-neutral-500">{error}</p>
        <button
          onClick={loadYears}
          className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <section className="py-12 animate-fade-in">
      <h1 className="text-2xl font-semibold text-neutral-100 mb-8">
        Browse by Year
      </h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {years.map((yearInfo) => (
          <YearCard
            key={yearInfo.year}
            year={yearInfo.year}
            albumCount={yearInfo.albumCount}
          />
        ))}
      </div>
    </section>
  );
}
