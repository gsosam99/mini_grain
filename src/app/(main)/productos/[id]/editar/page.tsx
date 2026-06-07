import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import PageHeader from '@/components/layout/PageHeader';
import ProductoForm from '@/components/productos/ProductoForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarProductoPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [productoRes, proveedoresRes] = await Promise.all([
    supabase
      .from('productos')
      .select('id, nombre, categoria, subcategoria, proveedor_id')
      .eq('id', id)
      .single(),
    supabase.from('proveedores').select('id, nombre').order('nombre'),
  ]);

  if (productoRes.error || !productoRes.data) notFound();

  return (
    <div>
      <Link href="/productos" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={14} />
        Productos
      </Link>
      <PageHeader title="Editar producto" />
      <ProductoForm
        proveedores={proveedoresRes.data ?? []}
        initialData={productoRes.data}
      />
    </div>
  );
}
