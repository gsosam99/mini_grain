'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Package,
  FlaskConical,
  Upload,
  Sprout,
  LogOut,
  ArrowLeftRight,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/productores', label: 'Productores', icon: Users },
  { href: '/productos', label: 'Productos', icon: Package },
  { href: '/analisis-suelos', label: 'Análisis de Suelos', icon: FlaskConical },
  { href: '/importacion', label: 'Importación', icon: Upload },
  { href: '/cambios', label: 'Cambios Logísticos', icon: ArrowLeftRight },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }, [supabase, router]);

  return (
    <aside className="w-16 shrink-0 bg-white border-r border-slate-200 flex flex-col min-h-screen">
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-slate-200">
        <Sprout size={22} className="text-green-700" />
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-center py-3 gap-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <div key={href} className="relative group w-full px-2">
              <Link
                href={href}
                className={[
                  'flex items-center justify-center w-full h-10 rounded-lg transition-colors',
                  isActive
                    ? 'bg-green-50 text-green-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                ].join(' ')}
              >
                <Icon size={18} />
              </Link>
              {/* Tooltip */}
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                {label}
              </span>
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="flex flex-col items-center py-3 border-t border-slate-200">
        <div className="relative group w-full px-2">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center w-full h-10 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <LogOut size={18} />
          </button>
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            Cerrar sesión
          </span>
        </div>
      </div>
    </aside>
  );
}
