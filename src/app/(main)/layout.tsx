import Sidebar from '@/components/layout/Sidebar';
import { requireAuth } from '@/lib/auth';

// App de gestión con datos en vivo (Supabase): nunca servir páginas ni fetches
// cacheados. force-dynamic deshabilita el render estático Y el cache de datos,
// garantizando que cada request lea el estado actual de la BD en producción.
export const dynamic = 'force-dynamic';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
