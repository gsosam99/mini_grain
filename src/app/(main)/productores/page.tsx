import { createSupabaseServerClient } from '@/lib/supabase/server';
import PageHeader from '@/components/layout/PageHeader';
import ProductoresTable from '@/components/productores/ProductoresTable';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Plus } from 'lucide-react';

export default async function ProductoresPage() {
  const supabase = await createSupabaseServerClient();

  const [productoresRes, lotesRes] = await Promise.all([
    supabase
      .from('productores')
      .select(`
        id, nombre, banco, credito_aprobado, estado, localidad,
        tecnico:tecnicos!productores_tecnico_id_fkey(id, nombre, contacto),
        coordinador:tecnicos!productores_coordinador_id_fkey(id, nombre),
        gerente:tecnicos!productores_gerente_id_fkey(id, nombre)
      `)
      .order('nombre'),
    supabase.from('lotes').select('id, productor_id, hectareas'),
  ]);

  type ProductorRow = {
    id: string; nombre: string; banco: string | null; credito_aprobado: number;
    estado: string | null; localidad: string | null;
    tecnico: { id: string; nombre: string; contacto: string | null } | null;
    coordinador: { id: string; nombre: string; contacto: string | null } | null;
    gerente: { id: string; nombre: string; contacto: string | null } | null;
  };
  const productores = (productoresRes.data ?? []) as unknown as ProductorRow[];
  const lotes = (lotesRes.data ?? []) as { id: string; productor_id: string; hectareas: number }[];

  return (
    <div>
      <PageHeader
        title="Productores"
        description={`${productores.length} productores registrados`}
        actions={
          <Link href="/productores/nuevo">
            <Button size="sm">
              <Plus size={16} />
              Nuevo productor
            </Button>
          </Link>
        }
      />
      <ProductoresTable productores={productores} lotes={lotes} />
    </div>
  );
}
