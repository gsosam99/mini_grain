import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/layout/PageHeader';
import LoteForm, { type SeedVariante, type SeedLine } from '@/components/lotes/LoteForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface Props {
  params: Promise<{ id: string; loteId: string }>;
}

export default async function EditarLotePage({ params }: Props) {
  const { id, loteId } = await params;
  const supabase = await createSupabaseServerClient();

  const [loteRes, planRes, seedProdRes] = await Promise.all([
    supabase
      .from('lotes')
      .select('id, nombre, hectareas, estado, productor:productores(id, nombre)')
      .eq('id', loteId)
      .eq('productor_id', id)
      .single(),
    supabase
      .from('planes')
      .select(`
        id,
        plan_productos(
          id, dosis_ha, lotes_ids, hectareas,
          variante:variantes_producto(id, producto:productos(categoria))
        )
      `)
      .eq('productor_id', id)
      .eq('ciclo', 2026)
      .maybeSingle(),
    supabase
      .from('productos')
      .select('id, nombre, variantes_producto(id, presentacion, unidad)')
      .eq('categoria', 'Semillas de Maíz')
      .order('nombre'),
  ]);

  if (loteRes.error || !loteRes.data) notFound();
  const lote = loteRes.data;

  const plan = planRes.data as unknown as {
    id: string;
    plan_productos: {
      id: string; dosis_ha: number; lotes_ids: string[] | null; hectareas: number | null;
      variante: { id: string; producto: { categoria: string } | null } | null;
    }[];
  } | null;

  // Catálogo de variantes de semilla
  const seedCatalog: SeedVariante[] = ((seedProdRes.data ?? []) as unknown as {
    nombre: string; variantes_producto: { id: string; presentacion: number; unidad: string }[];
  }[]).flatMap((p) =>
    p.variantes_producto.map((v) => ({
      varianteId: v.id, productoNombre: p.nombre, presentacion: v.presentacion, unidad: v.unidad,
    })),
  );

  // Líneas de semilla actuales de ESTE lote
  const seedLinesIniciales: SeedLine[] = (plan?.plan_productos ?? [])
    .filter(
      (pp) =>
        pp.variante?.producto?.categoria === 'Semillas de Maíz' &&
        (pp.lotes_ids ?? []).includes(loteId),
    )
    .map((pp) => ({
      id: pp.id,
      varianteId: pp.variante!.id,
      hectareas: pp.hectareas != null ? String(pp.hectareas) : '',
      dosisHa: pp.dosis_ha,
    }));

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
        planId={plan?.id}
        initialData={{ id: lote.id, nombre: lote.nombre, hectareas: lote.hectareas, estado: lote.estado }}
        seedCatalog={seedCatalog}
        seedLinesIniciales={seedLinesIniciales}
      />
    </div>
  );
}
