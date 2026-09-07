import { createSupabaseServerClient } from '@/lib/supabase/server';
import PageHeader from '@/components/layout/PageHeader';
import ProductoresTable from '@/components/productores/ProductoresTable';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Plus } from 'lucide-react';
import type { Productor, Tecnico } from '@/types';

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

  type ProductorRow = Pick<
    Productor,
    'id' | 'nombre' | 'banco' | 'credito_aprobado' | 'estado' | 'localidad'
  > & {
    tecnico: Pick<Tecnico, 'id' | 'nombre' | 'contacto'> | null;
    coordinador: Pick<Tecnico, 'id' | 'nombre' | 'contacto'> | null;
    gerente: Pick<Tecnico, 'id' | 'nombre' | 'contacto'> | null;
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
