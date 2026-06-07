import { Link } from '@/i18n/navigation';
import type { Highlight } from './types';

interface HighlightResultCardProps {
 highlight: Highlight;
}

export function HighlightResultCard({ highlight }: HighlightResultCardProps) {
 return (
 <Link
  href={`/read/${highlight.bookId}`}
  className="block bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-amber-200/50 dark:border-amber-800/30 p-4 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all duration-200"
 >
  <div className="flex items-start gap-2">
  <span className="text-amber-500 text-sm mt-0.5">
   {highlight.type === 'highlight' ? '✍️' : highlight.type === 'note' ? '📝' : '🔖'}
  </span>
  <div className="flex-1 min-w-0">
   <p className="text-sm text-gray-700 line-clamp-2">{highlight.content}</p>
   <p className="text-xs text-gray-400 mt-1">{highlight.type} &middot; {new Date(highlight.createdAt).toLocaleDateString()}</p>
  </div>
  </div>
 </Link>
 );
}
