import { createSupabaseServerClient } from '@/lib/supabase/server';
import PageHeader from '@/components/layout/PageHeader';
import ProductoForm from '@/components/productos/ProductoForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function NuevoProductoPage() {
  const supabase = await createSupabaseServerClient();
  const { data: proveedores } = await supabase
    .from('proveedores')
    .select('id, nombre')
    .order('nombre');

  return (
    <div>
      <Link href="/productos" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={14} />
        Productos
      </Link>
      <PageHeader title="Nuevo producto" />
      <ProductoForm proveedores={proveedores ?? []} />
    </div>
  );
}
