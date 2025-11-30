import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui';
import { Disc, Star, Check } from '@/lib/icons';

interface Album {
  id: number;
  slug: string;
  title: string;
  year?: string;
  platform?: string;
  cover_url?: string;
  track_count?: number;
  is_favorite?: boolean;
  is_downloaded?: boolean;
}

interface AlbumCardProps {
  album: Album;
  className?: string;
}

export function AlbumCard({ album, className }: AlbumCardProps) {
  return (
    <Link
      to={`/album/${encodeURIComponent(album.slug)}`}
      className={cn(
        'group block p-4 rounded-xl bg-neutral-900',
        'border border-neutral-800 hover:border-neutral-700',
        'transition-all duration-200 hover:bg-neutral-800',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
        className
      )}
    >
      {/* Album Art */}
      <div className="relative aspect-square mb-4 rounded-lg bg-neutral-800 overflow-hidden">
        {album.cover_url ? (
          <img
            src={album.cover_url}
            alt={album.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Disc className="w-12 h-12 text-neutral-700" />
          </div>
        )}

        {/* Status Icons */}
        <div className="absolute top-2 right-2 flex gap-1">
          {album.is_favorite && (
            <div className="p-1.5 rounded-full bg-black/60 backdrop-blur-sm">
              <Star className="w-3.5 h-3.5 text-warning fill-current" />
            </div>
          )}
          {album.is_downloaded && (
            <div className="p-1.5 rounded-full bg-black/60 backdrop-blur-sm">
              <Check className="w-3.5 h-3.5 text-success" />
            </div>
          )}
        </div>
      </div>

      {/* Album Info */}
      <div className="space-y-2">
        <h3 className="font-medium text-neutral-100 truncate group-hover:text-accent-400 transition-colors">
          {album.title}
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          {album.platform && (
            <Badge variant="default">{album.platform}</Badge>
          )}
          {album.year && (
            <span className="text-xs text-neutral-500">{album.year}</span>
          )}
          {album.track_count !== undefined && (
            <span className="text-xs text-neutral-500">
              {album.track_count} tracks
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
