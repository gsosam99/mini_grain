import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import PageHeader from '@/components/layout/PageHeader';
import ProductorTabs, { type ProductorTabsProps } from '@/components/productores/ProductorTabs';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Pencil, ArrowLeft } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductorDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [productorRes, lotesRes, planRes, historialCalRes] = await Promise.all([
    supabase
      .from('productores')
      .select(`
        id, nombre, banco, credito_aprobado, estado, localidad,
        tecnico:tecnicos!productores_tecnico_id_fkey(id, nombre, contacto),
        coordinador:tecnicos!productores_coordinador_id_fkey(id, nombre, contacto),
        gerente:tecnicos!productores_gerente_id_fkey(id, nombre, contacto)
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('lotes')
      .select(`
        id, nombre, hectareas, estado,
        analisis_suelos(id, anio, laboratorio, clase_textural, ph, ca_me, mg_me, na_me, k_me,
          dosis_cal, total_cal_tm, dosis_kmag, total_kmag, dosis_magniplus, total_magniplus)
      `)
      .eq('productor_id', id)
      .order('nombre'),
    supabase
      .from('planes')
      .select(`
        id, ciclo,
        plan_productos(
          id, dosis_ha, lotes_ids, precio_override, created_at,
          variante:variantes_producto(
            id, unidad, presentacion, precio,
            producto:productos(id, nombre, categoria, subcategoria,
              proveedor:proveedores(id, nombre)
            )
          ),
          plan_cambios(
            id, tipo, dosis_original, dosis_nueva, motivo, fecha,
            variante_original:variantes_producto!plan_cambios_variante_original_id_fkey(
              id, unidad, presentacion, precio,
              producto:productos(id, nombre)
            ),
            variante_nueva:variantes_producto!plan_cambios_variante_nueva_id_fkey(
              id, unidad, presentacion, precio,
              producto:productos(id, nombre)
            )
          )
        )
      `)
      .eq('productor_id', id)
      .single(),
    supabase
      .from('historial_cal')
      .select('id, anio, cantidad_tm, costo, tipo_cal, lote_id')
      .eq('productor_id', id)
      .order('anio', { ascending: false }),
  ]);

  if (productorRes.error || !productorRes.data) {
    notFound();
  }

  const productor = productorRes.data as unknown as ProductorTabsProps['productor'];
  const lotes = (lotesRes.data ?? []) as unknown as ProductorTabsProps['lotes'];
  const plan = (planRes.data ?? null) as unknown as ProductorTabsProps['plan'];
  const historialCal = (historialCalRes.data ?? []) as unknown as ProductorTabsProps['historialCal'];

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/productores"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft size={14} />
          Productores
        </Link>
        <PageHeader
          title={productor.nombre}
          description={`${productor.estado ?? ''}${productor.localidad ? ' · ' + productor.localidad : ''}`}
          actions={
            <Link href={`/productores/${id}/editar`}>
              <Button variant="secondary" size="sm">
                <Pencil size={14} />
                Editar
              </Button>
            </Link>
          }
        />
      </div>

      <ProductorTabs
        productor={productor}
        lotes={lotes}
        plan={plan}
        historialCal={historialCal}
        productorId={id}
      />
    </div>
  );
}
