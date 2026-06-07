'use client';

export default function LoginError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-rose-700">Algo salió mal</h2>
        <button onClick={reset} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
          Reintentar
        </button>
      </div>
    </div>
  );
}
