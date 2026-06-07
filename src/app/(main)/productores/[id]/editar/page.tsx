import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import PageHeader from '@/components/layout/PageHeader';
import ProductorForm from '@/components/productores/ProductorForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarProductorPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [productorRes, tecnicosRes] = await Promise.all([
    supabase
      .from('productores')
      .select('id, nombre, banco, credito_aprobado, estado, localidad, tecnico_id, coordinador_id, gerente_id')
      .eq('id', id)
      .single(),
    supabase.from('tecnicos').select('id, nombre, rol').order('nombre'),
  ]);

  if (productorRes.error || !productorRes.data) {
    notFound();
  }

  return (
    <div>
      <Link
        href={`/productores/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft size={14} />
        Volver al productor
      </Link>
      <PageHeader title="Editar productor" />
      <ProductorForm
        tecnicos={tecnicosRes.data ?? []}
        initialData={productorRes.data}
      />
    </div>
  );
}
