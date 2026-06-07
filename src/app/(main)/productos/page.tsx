import { createSupabaseServerClient } from '@/lib/supabase/server';
import PageHeader from '@/components/layout/PageHeader';
import ProductosCatalogo, { type ProductosCatalogoProps } from '@/components/productos/ProductosCatalogo';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Plus } from 'lucide-react';

export default async function ProductosPage() {
  const supabase = await createSupabaseServerClient();

  const [productosRes, proveedoresRes] = await Promise.all([
    supabase
      .from('productos')
      .select(`
        id, nombre, categoria, subcategoria,
        proveedor:proveedores(id, nombre),
        variantes:variantes_producto(id, unidad, presentacion, precio)
      `)
      .order('nombre'),
    supabase.from('proveedores').select('id, nombre').order('nombre'),
  ]);

  const productos = (productosRes.data ?? []) as unknown as ProductosCatalogoProps['productos'];
  const proveedores = (proveedoresRes.data ?? []) as { id: string; nombre: string }[];

  return (
    <div>
      <PageHeader
        title="Catálogo de Productos"
        description={`${productos.length} productos registrados`}
        actions={
          <Link href="/productos/nuevo">
            <Button size="sm">
              <Plus size={16} />
              Nuevo producto
            </Button>
          </Link>
        }
      />
      <ProductosCatalogo productos={productos} proveedores={proveedores} />
    </div>
  );
}
