'use client';

import { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { calcularRedondeo } from '@/lib/rounding';
import type { VarianteProducto, Producto } from '@/types';

interface PlanProducto {
  id: string;
  dosis_ha: number;
  lotes_ids: string[] | null;
  variante: {
    id: string;
    unidad: string;
    presentacion: number;
    precio: number;
    producto: { id: string; nombre: string; categoria: string } | null;
  } | null;
  plan_cambios: {
    id: string; tipo: string; dosis_original: number | null; dosis_nueva: number | null;
    motivo: string | null; fecha: string;
    variante_original: { id: string; unidad: string; presentacion: number; precio: number;
      producto: { id: string; nombre: string } | null;
    } | null;
    variante_nueva: { id: string; unidad: string; presentacion: number; precio: number;
      producto: { id: string; nombre: string } | null;
    } | null;
  }[];
}

interface Lote {
  id: string;
  nombre: string;
  hectareas: number;
}

interface Props {
  open: boolean;
  planProducto: PlanProducto;
  lotes: Lote[];
  planId: string;
  onClose: () => void;
  onGuardado: (plan: { id: string; ciclo: number; plan_productos: PlanProducto[] }) => void;
}

type VarianteConProducto = VarianteProducto & { producto?: Producto };

export default function EditarPlanProductoModal({
  open,
  planProducto,
  lotes,
  planId,
  onClose,
  onGuardado,
}: Props) {
  const [dosisHa, setDosisHa] = useState(String(planProducto.dosis_ha));
  const [varianteId, setVarianteId] = useState(planProducto.variante?.id ?? '');
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [variantes, setVariantes] = useState<VarianteConProducto[]>([]);
  const [loadingVariantes, setLoadingVariantes] = useState(false);

  const productoId = planProducto.variante?.producto?.id;

  useEffect(() => {
    if (!productoId || !open) return;
    setLoadingVariantes(true);
    const supabase = createSupabaseBrowserClient();
    supabase
      .from('variantes_producto')
      .select('id, unidad, presentacion, precio, producto_id')
      .eq('producto_id', productoId)
      .then(({ data }) => {
        setVariantes((data ?? []) as VarianteConProducto[]);
        setLoadingVariantes(false);
      });
  }, [productoId, open]);

  const varianteActual = variantes.find((v) => v.id === varianteId);
  const ha = useMemo(() => {
    const aplicables = planProducto.lotes_ids
      ? lotes.filter((l) => planProducto.lotes_ids!.includes(l.id))
      : lotes;
    return aplicables.reduce((s, l) => s + l.hectareas, 0);
  }, [planProducto.lotes_ids, lotes]);

  const preview = useMemo(() => {
    if (!varianteActual || !dosisHa) return null;
    return calcularRedondeo({
      dosisHa: Number(dosisHa),
      hectareas: ha,
      presentacion: varianteActual.presentacion,
      precio: varianteActual.precio,
    });
  }, [varianteActual, dosisHa, ha]);

  const hayDelta =
    varianteId !== planProducto.variante?.id ||
    Number(dosisHa) !== planProducto.dosis_ha;

  const handleGuardar = async () => {
    if (!dosisHa || !varianteId) return;
    setLoading(true);
    setError('');

    try {
      const supabase = createSupabaseBrowserClient();

      const { error: updateError } = await supabase
        .from('plan_productos')
        .update({ dosis_ha: Number(dosisHa), variante_id: varianteId })
        .eq('id', planProducto.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      if (hayDelta) {
        const tipo =
          varianteId !== planProducto.variante?.id ? 'cambio_variante' : 'cambio_dosis';
        await supabase.from('plan_cambios').insert({
          plan_producto_id: planProducto.id,
          tipo,
          variante_original_id: planProducto.variante?.id ?? null,
          variante_nueva_id: varianteId !== planProducto.variante?.id ? varianteId : null,
          dosis_original: planProducto.dosis_ha,
          dosis_nueva: Number(dosisHa),
          motivo: motivo || null,
        });
      }

      const { data: planActualizado } = await supabase
        .from('planes')
        .select(`
          id, ciclo,
          plan_productos(
            id, dosis_ha, lotes_ids, created_at,
            variante:variantes_producto(
              id, unidad, presentacion, precio,
              producto:productos(id, nombre, categoria, subcategoria,
                proveedor:proveedores(id, nombre)
              )
            ),
            plan_cambios(
              id, tipo, dosis_original, dosis_nueva, motivo, fecha,
              variante_original:variantes_producto!plan_cambios_variante_original_id_fkey(
                id, unidad, presentacion, precio, producto:productos(id, nombre)
              ),
              variante_nueva:variantes_producto!plan_cambios_variante_nueva_id_fkey(
                id, unidad, presentacion, precio, producto:productos(id, nombre)
              )
            )
          )
        `)
        .eq('id', planId)
        .single();

      if (planActualizado) {
        onGuardado(planActualizado as unknown as Parameters<typeof onGuardado>[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Editar producto del plan" size="lg">
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-lg p-3 text-sm">
          <p className="font-semibold text-slate-900">
            {planProducto.variante?.producto?.nombre ?? 'Producto'}
          </p>
          <p className="text-slate-500">
            {planProducto.variante?.presentacion} {planProducto.variante?.unidad} · $
            {planProducto.variante?.precio}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Dosis por Ha"
            type="number"
            step="0.001"
            min="0"
            value={dosisHa}
            onChange={(e) => setDosisHa(e.target.value)}
          />
          <Select
            label="Variante (presentación)"
            value={varianteId}
            onChange={(e) => setVarianteId(e.target.value)}
            options={variantes.map((v) => ({
              value: v.id,
              label: `${v.presentacion} ${v.unidad} — $${v.precio}`,
            }))}
            disabled={loadingVariantes}
          />
        </div>

        {preview && (
          <div className="bg-green-50 rounded-lg p-3 text-xs space-y-1 border border-green-200">
            <p className="font-semibold text-green-800">Vista previa del cálculo</p>
            <div className="grid grid-cols-3 gap-2 text-green-700">
              <div>
                <p className="text-green-600">Total sin redondear</p>
                <p className="font-mono font-medium">{preview.totalSinRedondear.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-green-600">Unidades necesarias</p>
                <p className="font-mono font-bold text-base">{preview.unidadesNecesarias}</p>
              </div>
              <div>
                <p className="text-green-600">Costo total</p>
                <p className="font-mono font-bold text-base">
                  ${preview.costoTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
        )}

        {hayDelta && (
          <Textarea
            label="Motivo del cambio (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Producto no disponible, cambio de proveedor..."
            rows={2}
          />
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} loading={loading} disabled={!dosisHa || !varianteId}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </Modal>
  );
}
