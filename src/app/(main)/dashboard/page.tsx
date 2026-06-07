import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import PageHeader from '@/components/layout/PageHeader';
import DashboardStats from '@/components/productores/DashboardStats';
import CreditoTable from '@/components/productores/CreditoTable';

export default async function DashboardPage() {
  await requireAuth();
  const supabase = await createSupabaseServerClient();

  const [productoresRes, lotesRes, planesRes] = await Promise.all([
    supabase
      .from('productores')
      .select('id, nombre, banco, credito_aprobado, estado')
      .order('nombre'),
    supabase.from('lotes').select('id, productor_id, hectareas'),
    supabase.from('plan_productos').select(`
      id, dosis_ha, lotes_ids,
      variante:variantes_producto(id, presentacion, precio, unidad,
        producto:productos(id, nombre, categoria)
      )
    `),
  ]);

  type PlanProductoRow = {
    id: string; dosis_ha: number; lotes_ids: string[] | null;
    variante: { id: string; presentacion: number; precio: number } | null;
  };

  const productores = (productoresRes.data ?? []) as {
    id: string; nombre: string; banco: string | null; credito_aprobado: number; estado: string | null;
  }[];
  const lotes = (lotesRes.data ?? []) as { id: string; productor_id: string; hectareas: number }[];
  const planProductos = (planesRes.data ?? []) as unknown as PlanProductoRow[];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Resumen del ciclo agrícola 2026"
      />
      <DashboardStats
        productores={productores}
        lotes={lotes}
        planProductos={planProductos}
      />
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Estado de Crédito por Productor</h2>
        <CreditoTable productores={productores} lotes={lotes} planProductos={planProductos} />
      </div>
    </div>
  );
}
