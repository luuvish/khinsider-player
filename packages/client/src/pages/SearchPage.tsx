import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sanitizeInput } from '@khinsider/shared';
import { searchApi } from '@/api/client';
import { logger } from '@/utils/logger';

// Maximum search query length
const MAX_SEARCH_LENGTH = 200;

interface SearchResult {
  id: number;
  title: string;
  url: string;
  year: string;
  platform: string;
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    // Sanitize and validate input
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
      setError('Search failed');
      logger.error('Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Search Albums</h1>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for game soundtracks..."
            className="input flex-1"
            maxLength={MAX_SEARCH_LENGTH}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
        {error && (
          <div className="mt-2 text-sm text-red-400">{error}</div>
        )}
      </form>

      {hasSearched && (
        <div>
          <div className="text-sm text-slate-400 mb-4">
            {results.length} results found
          </div>

          <div className="grid gap-2">
            {results.map((result) => (
              <Link
                key={result.id}
                to={`/album/${result.id}`}
                className="card p-4 hover:bg-slate-700/50 transition-colors flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{result.title}</div>
                  <div className="text-sm text-slate-400">
                    {result.platform} - {result.year}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
