import { createSupabaseServerClient } from '@/lib/supabase/server';
import PageHeader from '@/components/layout/PageHeader';
import AnalisisSuelosPanel, { type AnalisisSuelosPanelProps } from '@/components/lotes/AnalisisSuelosPanel';

export default async function AnalisisSuelosPage() {
  const supabase = await createSupabaseServerClient();

  const { data: analisis } = await supabase
    .from('analisis_suelos')
    .select(`
      id, anio, laboratorio, clase_textural, ph,
      dosis_cal, total_cal_tm, dosis_kmag, total_kmag, dosis_magniplus, total_magniplus,
      lote:lotes(
        id, nombre, hectareas,
        productor:productores(id, nombre, estado)
      )
    `)
    .order('anio', { ascending: false });

  return (
    <div>
      <PageHeader
        title="Análisis de Suelos"
        description="Resultados de análisis de suelos por lote"
      />
      <AnalisisSuelosPanel analisis={(analisis ?? []) as unknown as AnalisisSuelosPanelProps['analisis']} />
    </div>
  );
}
