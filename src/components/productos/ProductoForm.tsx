'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import { CATEGORIAS_PRODUCTO, SUBCATEGORIAS_PRODUCTO, UNIDADES } from '@/types';
import { Plus, Trash2 } from 'lucide-react';

interface Proveedor {
  id: string;
  nombre: string;
}

interface VarianteInput {
  unidad: string;
  presentacion: string;
  precio: string;
}

interface Props {
  proveedores: Proveedor[];
  initialData?: {
    id: string;
    nombre: string;
    categoria: string;
    subcategoria: string | null;
    proveedor_id: string | null;
  };
}

export default function ProductoForm({ proveedores, initialData }: Props) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [form, setForm] = useState({
    nombre: initialData?.nombre ?? '',
    categoria: initialData?.categoria ?? CATEGORIAS_PRODUCTO[0],
    subcategoria: initialData?.subcategoria ?? '',
    proveedor_id: initialData?.proveedor_id ?? '',
    nuevoProveedor: '',
  });
  const [variantes, setVariantes] = useState<VarianteInput[]>([
    { unidad: 'lt', presentacion: '', precio: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const subcats = SUBCATEGORIAS_PRODUCTO[form.categoria] ?? [];

  const addVariante = () =>
    setVariantes((prev) => [...prev, { unidad: 'lt', presentacion: '', precio: '' }]);

  const removeVariante = (i: number) =>
    setVariantes((prev) => prev.filter((_, idx) => idx !== i));

  const setVariante = (i: number, field: keyof VarianteInput, value: string) =>
    setVariantes((prev) => prev.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setLoading(true);
    setError('');

    const supabase = createSupabaseBrowserClient();

    try {
      let proveedorId = form.proveedor_id || null;

      if (form.nuevoProveedor.trim()) {
        const { data: prov } = await supabase
          .from('proveedores')
          .upsert({ nombre: form.nuevoProveedor.trim() }, { onConflict: 'nombre' })
          .select('id')
          .single();
        proveedorId = prov?.id ?? null;
      }

      const payload = {
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        subcategoria: form.subcategoria || null,
        proveedor_id: proveedorId,
      };

      if (isEdit) {
        const { error: err } = await supabase
          .from('productos')
          .update(payload)
          .eq('id', initialData.id);
        if (err) { setError(err.message); return; }
      } else {
        const { data: prod, error: err } = await supabase
          .from('productos')
          .insert(payload)
          .select('id')
          .single();
        if (err) { setError(err.message); return; }

        const variantesValidas = variantes.filter((v) => v.presentacion && v.precio);
        if (variantesValidas.length > 0) {
          await supabase.from('variantes_producto').insert(
            variantesValidas.map((v) => ({
              producto_id: prod.id,
              unidad: v.unidad,
              presentacion: Number(v.presentacion),
              precio: Number(v.precio),
            }))
          );
        }
      }

      router.push('/productos');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Datos del producto</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="Nombre del producto *"
            value={form.nombre}
            onChange={set('nombre')}
            placeholder="Dual gold"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Categoría"
              value={form.categoria}
              onChange={set('categoria')}
              options={CATEGORIAS_PRODUCTO.map((c) => ({ value: c, label: c }))}
            />
            <Select
              label="Subcategoría"
              value={form.subcategoria}
              onChange={set('subcategoria')}
              placeholder="Sin subcategoría"
              options={subcats.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Proveedor existente"
              value={form.proveedor_id}
              onChange={set('proveedor_id')}
              placeholder="Sin proveedor"
              options={proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
            />
            <Input
              label="O crear nuevo proveedor"
              value={form.nuevoProveedor}
              onChange={set('nuevoProveedor')}
              placeholder="Nombre del proveedor"
              hint="Si se completa, tiene prioridad"
            />
          </div>
        </CardBody>
      </Card>

      {!isEdit && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Variantes / Presentaciones</h3>
            <button
              type="button"
              onClick={addVariante}
              className="text-xs text-green-700 hover:text-green-900 flex items-center gap-1"
            >
              <Plus size={14} />
              Agregar
            </button>
          </CardHeader>
          <CardBody className="space-y-3">
            {variantes.map((v, i) => (
              <div key={i} className="grid grid-cols-3 gap-3 items-end">
                <Select
                  label={i === 0 ? 'Unidad' : ''}
                  value={v.unidad}
                  onChange={(e) => setVariante(i, 'unidad', e.target.value)}
                  options={UNIDADES.map((u) => ({ value: u, label: u }))}
                />
                <Input
                  label={i === 0 ? 'Presentación' : ''}
                  type="number"
                  step="0.1"
                  min="0"
                  value={v.presentacion}
                  onChange={(e) => setVariante(i, 'presentacion', e.target.value)}
                  placeholder="5"
                />
                <div className="flex gap-2">
                  <Input
                    label={i === 0 ? 'Precio ($)' : ''}
                    type="number"
                    step="0.01"
                    min="0"
                    value={v.precio}
                    onChange={(e) => setVariante(i, 'precio', e.target.value)}
                    placeholder="0.00"
                  />
                  {variantes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeVariante(i)}
                      className={['text-slate-400 hover:text-rose-600', i === 0 ? 'mt-6' : ''].join(' ')}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" loading={loading}>
          {isEdit ? 'Guardar cambios' : 'Crear producto'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
