import { useState, useRef } from 'react';
import { sanitizeInput } from '@khinsider/shared';
import { searchApi } from '@/api/client';
import { logger } from '@/utils/logger';
import { AlbumCard } from '@/components/features';
import { Input, Button, Skeleton } from '@/components/ui';
import { Search, AlertCircle, Music } from '@/lib/icons';

const MAX_SEARCH_LENGTH = 200;

interface SearchResult {
  id: number;
  title: string;
  url: string;
  year: string;
  platform: string;
  slug: string;
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    const sanitizedQuery = sanitizeInput(query, MAX_SEARCH_LENGTH);

    if (sanitizedQuery.length < 2) {
      setError('Search query must be at least 2 characters');
      return;
    }

    if (sanitizedQuery.length > MAX_SEARCH_LENGTH) {
      setError(`Search query must be less than ${MAX_SEARCH_LENGTH} characters`);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const { data } = await searchApi.search(sanitizedQuery);
      setResults(data.results);
      setHasSearched(true);
    } catch (err) {
      setError('Search failed. Please try again.');
      logger.error('Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="py-8 sm:py-12 animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-100 mb-2">
          Search Albums
        </h1>
        <p className="text-neutral-400">
          Find your favorite game soundtracks
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-8 sm:mb-12">
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for game soundtracks..."
              maxLength={MAX_SEARCH_LENGTH}
              autoComplete="off"
              icon={Search}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            loading={isLoading}
            disabled={query.length < 2}
          >
            Search
          </Button>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-error">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </form>

      {/* Results */}
      {isLoading ? (
        <div>
          <Skeleton className="h-5 w-32 mb-6" />
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
      ) : hasSearched ? (
        <div>
          <p className="text-sm text-neutral-400 mb-6">
            {results.length} {results.length === 1 ? 'result' : 'results'} found
          </p>

          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Music className="w-12 h-12 text-neutral-700 mb-4" />
              <p className="text-lg text-neutral-300 mb-2">No results found</p>
              <p className="text-sm text-neutral-500">
                Try searching with different keywords
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {results.map((result) => (
                <AlbumCard
                  key={result.id}
                  album={{
                    id: result.id,
                    slug: result.slug,
                    title: result.title,
                    year: result.year,
                    platform: result.platform,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-16 h-16 text-neutral-800 mb-4" />
          <p className="text-neutral-400">
            Enter a search term to find albums
          </p>
        </div>
      )}
    </section>
  );
}
