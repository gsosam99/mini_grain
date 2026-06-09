'use client';

import { ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import type { SortDir } from '@/hooks/useSortable';

interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  currentKey: K | null;
  dir: SortDir;
  onSort: (key: K) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export default function SortableHeader<K extends string>({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  align = 'left',
  className = '',
}: SortableHeaderProps<K>) {
  const active = currentKey === sortKey;

  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  const justifyClass =
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th className={['px-4 py-3', alignClass, className].join(' ')}>
      <button
        onClick={() => onSort(sortKey)}
        className={[
          'inline-flex items-center gap-1 font-medium text-xs uppercase tracking-wide',
          'transition-colors select-none',
          active ? 'text-green-700' : 'text-slate-500 hover:text-slate-800',
          justifyClass,
          'w-full',
        ].join(' ')}
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ChevronUp size={13} className="shrink-0" />
          ) : (
            <ChevronDown size={13} className="shrink-0" />
          )
        ) : (
          <ChevronsUpDown size={13} className="shrink-0 opacity-40" />
        )}
      </button>
    </th>
  );
}
