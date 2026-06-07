import Sidebar from '@/components/layout/Sidebar';
import { requireAuth } from '@/lib/auth';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
