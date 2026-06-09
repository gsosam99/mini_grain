import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import PageHeader from '@/components/layout/PageHeader';
import CambioMasivoWizard from '@/components/cambios/CambioMasivoWizard';

export default async function CambiosPage() {
  await requireAuth();
  const supabase = await createSupabaseServerClient();

  const [productosRes, productoresRes, lotesRes] = await Promise.all([
    supabase
      .from('productos')
      .select(`
        id, nombre, categoria, subcategoria,
        variantes:variantes_producto(id, presentacion, unidad, precio)
      `)
      .order('nombre'),
    supabase.from('productores').select('id, nombre').order('nombre'),
    supabase.from('lotes').select('id, productor_id, hectareas'),
  ]);

  return (
    <div>
      <PageHeader
        title="Cambio Logístico Masivo"
        description="Aplicá sustituciones, cambios de precio o dosis a múltiples planes en una sola operación"
      />
      <CambioMasivoWizard
        productos={(productosRes.data ?? []) as ProductoConVariantes[]}
        productores={(productoresRes.data ?? []) as { id: string; nombre: string }[]}
        lotes={(lotesRes.data ?? []) as { id: string; productor_id: string; hectareas: number }[]}
      />
    </div>
  );
}

interface VarianteItem {
  id: string;
  presentacion: number;
  unidad: string;
  precio: number;
}

interface ProductoConVariantes {
  id: string;
  nombre: string;
  categoria: string;
  subcategoria: string | null;
  variantes: VarianteItem[];
}
