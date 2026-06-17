import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/layout/PageHeader';
import LoteForm from '@/components/lotes/LoteForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface Props {
  params: Promise<{ id: string; loteId: string }>;
}

export default async function EditarLotePage({ params }: Props) {
  const { id, loteId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, nombre, hectareas, estado, productor:productores(id, nombre)')
    .eq('id', loteId)
    .eq('productor_id', id)
    .single();

  if (!lote) notFound();

  const productorNombre =
    (lote.productor as unknown as { nombre: string } | null)?.nombre ?? 'Productor';

  return (
    <div>
      <Link
        href={`/productores/${id}/lotes/${loteId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft size={14} />
        {lote.nombre}
      </Link>
      <PageHeader title="Editar lote" description={`${productorNombre} · ${lote.nombre}`} />
      <LoteForm
        productorId={id}
        initialData={{
          id: lote.id,
          nombre: lote.nombre,
          hectareas: lote.hectareas,
          estado: lote.estado,
        }}
      />
    </div>
  );
}
