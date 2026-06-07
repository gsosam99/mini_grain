import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/layout/PageHeader';
import LoteForm from '@/components/lotes/LoteForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NuevoLotePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: productor } = await supabase
    .from('productores')
    .select('id, nombre')
    .eq('id', id)
    .single();

  if (!productor) notFound();

  return (
    <div>
      <Link
        href={`/productores/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft size={14} />
        {productor.nombre}
      </Link>
      <PageHeader title="Nuevo lote" description={`Para ${productor.nombre}`} />
      <LoteForm productorId={id} />
    </div>
  );
}
