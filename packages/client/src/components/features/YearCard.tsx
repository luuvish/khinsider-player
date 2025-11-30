import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

interface YearCardProps {
  year: string;
  albumCount?: number;
  className?: string;
}

export function YearCard({ year, albumCount, className }: YearCardProps) {
  return (
    <Link
      to={`/year/${year}`}
      className={cn(
        'group block p-6 rounded-xl bg-neutral-900',
        'border border-neutral-800 hover:border-neutral-700',
        'transition-all duration-200 hover:scale-[1.02]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
        className
      )}
    >
      <p className="text-3xl font-bold text-neutral-100 group-hover:text-accent-400 transition-colors">
        {year}
      </p>
      {albumCount !== undefined && (
        <p className="mt-2 text-sm text-neutral-500">
          {albumCount} {albumCount === 1 ? 'album' : 'albums'}
        </p>
      )}
    </Link>
  );
}
