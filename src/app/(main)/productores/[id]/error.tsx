'use client';

import { useEffect } from 'react';

export default function ProductorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-6 text-center">
      <h2 className="text-lg font-semibold text-rose-700">Error al cargar el productor</h2>
      <button onClick={reset} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
        Reintentar
      </button>
    </div>
  );
}
