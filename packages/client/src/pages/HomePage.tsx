import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { albumsApi } from '@/api/client';
import { logger } from '@/utils/logger';

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
      // Cleanup: abort pending request on unmount
      abortControllerRef.current?.abort();
    };
  }, []);

  const loadYears = async () => {
    // Abort any existing request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      const { data } = await albumsApi.getYears(abortControllerRef.current.signal);
      setYears(data.years);
    } catch (err) {
      // Don't set error for aborted requests
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
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading...</div>
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
      <h1 className="text-2xl font-bold mb-6">Browse by Year</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {years.map((yearInfo) => (
          <Link
            key={yearInfo.year}
            to={`/year/${yearInfo.year}`}
            className="card p-4 hover:bg-slate-700/50 transition-colors"
          >
            <div className="text-xl font-bold text-primary-400">
              {yearInfo.year}
            </div>
            <div className="text-sm text-slate-400">
              {yearInfo.albumCount} albums
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
