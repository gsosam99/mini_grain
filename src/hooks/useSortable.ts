import { useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  key: K | null;
  dir: SortDir;
}

export function useSortable<K extends string = string>(defaultKey?: K, defaultDir: SortDir = 'asc') {
  const [sort, setSort] = useState<SortState<K>>({
    key: defaultKey ?? null,
    dir: defaultDir,
  });

  const toggle = (key: K) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  return { sort, toggle };
}

/** Ordenar array genérico dado el estado de sort y un getter de valor por clave */
export function applySortable<T, K extends string>(
  items: T[],
  sort: SortState<K>,
  getValue: (item: T, key: K) => string | number | null | undefined
): T[] {
  if (!sort.key) return items;
  const key = sort.key;
  return [...items].sort((a, b) => {
    const va = getValue(a, key) ?? '';
    const vb = getValue(b, key) ?? '';
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' });
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}
