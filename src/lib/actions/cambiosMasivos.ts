'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type TipoCambio =
  | 'sustitucion_producto'
  | 'cambio_variante'
  | 'cambio_precio'
  | 'cambio_dosis';

export interface AplicarCambioParams {
  tipo: TipoCambio;
  descripcion: string;
  motivo: string;
  varianteOrigenId: string;
  /** Sustitucion / cambio_variante: nueva variante a asignar */
  varianteDestinoId?: string;
  /** cambio_dosis: nueva dosis */
  nuevaDosis?: number;
  /** cambio_precio: nuevo precio */
  nuevoPrecio?: number;
  /** IDs concretos de plan_productos a actualizar (ya filtrados por scope en el cliente) */
  planProductoIds: string[];
  /** Precios actuales por plan_producto_id — para registrar precio_original en plan_cambios */
  preciosOriginales?: Record<string, number>;
}

export interface AplicarCambioResult {
  ok: boolean;
  batchId?: string;
  afectados?: number;
  error?: string;
}

export async function aplicarCambioMasivo(
  params: AplicarCambioParams,
): Promise<AplicarCambioResult> {
  const supabase = await createSupabaseServerClient();

  const {
    tipo,
    descripcion,
    motivo,
    varianteOrigenId,
    varianteDestinoId,
    nuevaDosis,
    nuevoPrecio,
    planProductoIds,
    preciosOriginales = {},
  } = params;

  if (planProductoIds.length === 0) {
    return { ok: false, error: 'No hay ítems seleccionados' };
  }

  try {
    // ── 1. Crear registro batch ──────────────────────────────────────────────
    const { data: batch, error: batchError } = await supabase
      .from('cambios_batch')
      .insert({ descripcion, tipo, afectados: planProductoIds.length })
      .select('id')
      .single();

    if (batchError || !batch) {
      throw new Error(batchError?.message ?? 'Error creando batch');
    }

    // ── 2. Obtener estado actual de los plan_productos afectados ─────────────
    const { data: planProductos, error: fetchError } = await supabase
      .from('plan_productos')
      .select('id, dosis_ha, variante_id')
      .in('id', planProductoIds);

    if (fetchError) throw new Error(fetchError.message);

    // ── 3. Aplicar el cambio según tipo ──────────────────────────────────────
    if ((tipo === 'sustitucion_producto' || tipo === 'cambio_variante') && varianteDestinoId) {
      const { error } = await supabase
        .from('plan_productos')
        .update({ variante_id: varianteDestinoId })
        .in('id', planProductoIds);
      if (error) throw new Error(error.message);

    } else if (tipo === 'cambio_dosis' && nuevaDosis !== undefined) {
      const { error } = await supabase
        .from('plan_productos')
        .update({ dosis_ha: nuevaDosis })
        .in('id', planProductoIds);
      if (error) throw new Error(error.message);

    } else if (tipo === 'cambio_precio' && nuevoPrecio !== undefined) {
      // El precio vive en variantes_producto — actualizar allí
      const { error } = await supabase
        .from('variantes_producto')
        .update({ precio: nuevoPrecio })
        .eq('id', varianteOrigenId);
      if (error) throw new Error(error.message);
    }

    // ── 4. Registrar plan_cambios individuales con batch_id ──────────────────
    const cambios = (planProductos ?? []).map((pp) => ({
      plan_producto_id: pp.id,
      tipo,
      batch_id: batch.id,
      motivo: motivo || null,
      variante_original_id: varianteOrigenId,
      variante_nueva_id:
        tipo === 'sustitucion_producto' || tipo === 'cambio_variante'
          ? varianteDestinoId ?? null
          : null,
      dosis_original: pp.dosis_ha,
      dosis_nueva: tipo === 'cambio_dosis' ? nuevaDosis ?? null : null,
      precio_original:
        tipo === 'cambio_precio' ? (preciosOriginales[pp.id] ?? null) : null,
      precio_nuevo: tipo === 'cambio_precio' ? nuevoPrecio ?? null : null,
    }));

    const { error: cambiosError } = await supabase.from('plan_cambios').insert(cambios);
    if (cambiosError) throw new Error(cambiosError.message);

    return { ok: true, batchId: batch.id, afectados: planProductoIds.length };

  } catch (err) {
    console.error('[aplicarCambioMasivo]', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error desconocido',
    };
  }
}
