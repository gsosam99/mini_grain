'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type TipoCambio =
  | 'sustitucion_producto'
  | 'cambio_variante'
  | 'cambio_precio'
  | 'cambio_dosis'
  | 'agregar_producto'
  | 'eliminar_producto';

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
  /** agregar_producto: productores (ids) a los que se les agrega el producto */
  productorIdsAgregar?: string[];
  /** agregar_producto: dosis/ha del producto agregado */
  dosisAgregar?: number;
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
    productorIdsAgregar = [],
    dosisAgregar,
  } = params;

  // ══ AGREGAR PRODUCTO — inserta una línea nueva por productor seleccionado ══
  if (tipo === 'agregar_producto') {
    if (!varianteDestinoId || productorIdsAgregar.length === 0 || dosisAgregar === undefined) {
      return { ok: false, error: 'Faltan datos para agregar el producto' };
    }
    try {
      const { data: batch, error: batchError } = await supabase
        .from('cambios_batch')
        .insert({ descripcion, tipo, afectados: productorIdsAgregar.length })
        .select('id')
        .single();
      if (batchError || !batch) throw new Error(batchError?.message ?? 'Error creando batch');

      // Resolver (o crear) el plan ciclo 2026 de cada productor e insertar la línea
      const insertRows: { plan_id: string; variante_id: string; dosis_ha: number; lotes_ids: null }[] = [];
      for (const productorId of productorIdsAgregar) {
        let { data: plan } = await supabase
          .from('planes').select('id').eq('productor_id', productorId).eq('ciclo', 2026).maybeSingle();
        if (!plan) {
          const { data: np } = await supabase
            .from('planes').insert({ productor_id: productorId, ciclo: 2026 }).select('id').single();
          plan = np;
        }
        if (plan) insertRows.push({ plan_id: plan.id, variante_id: varianteDestinoId, dosis_ha: dosisAgregar, lotes_ids: null });
      }

      const { data: inserted, error: insErr } = await supabase
        .from('plan_productos').insert(insertRows).select('id');
      if (insErr) throw new Error(insErr.message);

      const cambios = (inserted ?? []).map((row) => ({
        plan_producto_id: row.id, tipo, batch_id: batch.id, motivo: motivo || null,
        variante_nueva_id: varianteDestinoId, dosis_nueva: dosisAgregar,
      }));
      if (cambios.length) {
        const { error: cErr } = await supabase.from('plan_cambios').insert(cambios);
        if (cErr) throw new Error(cErr.message);
      }
      return { ok: true, batchId: batch.id, afectados: insertRows.length };
    } catch (err) {
      console.error('[aplicarCambioMasivo:agregar]', err);
      return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
  }

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
      .select('id, dosis_ha, variante_id, plan_id, lotes_ids')
      .in('id', planProductoIds);

    if (fetchError) throw new Error(fetchError.message);

    // ── 3. Aplicar el cambio según tipo ──────────────────────────────────────
    if ((tipo === 'sustitucion_producto' || tipo === 'cambio_variante') && varianteDestinoId) {
      const { error } = await supabase
        .from('plan_productos')
        .update({ variante_id: varianteDestinoId })
        .in('id', planProductoIds);
      if (error) throw new Error(error.message);

      // ── Prevenir duplicados ───────────────────────────────────────────────
      // Al reasignar variante_id, un (plan, lote) puede quedar con DOS
      // plan_productos de la misma variante. Los fusionamos en uno solo para
      // que el costo no se duplique:
      //   · sustitución de producto → se SUMAN las dosis (combina cantidades)
      //   · cambio de presentación  → se conserva la mayor (es la misma línea)
      const planIds = [...new Set((planProductos ?? []).map((p) => p.plan_id))];
      if (planIds.length > 0) {
        const { data: rows } = await supabase
          .from('plan_productos')
          .select('id, plan_id, lotes_ids, dosis_ha')
          .eq('variante_id', varianteDestinoId)
          .in('plan_id', planIds);

        const grupos = new Map<string, { id: string; dosis_ha: number }[]>();
        for (const r of rows ?? []) {
          const key = `${r.plan_id}|${r.lotes_ids ? [...r.lotes_ids].sort().join(',') : 'all'}`;
          if (!grupos.has(key)) grupos.set(key, []);
          grupos.get(key)!.push({ id: r.id, dosis_ha: r.dosis_ha });
        }

        for (const items of grupos.values()) {
          if (items.length < 2) continue;
          const keep = items.reduce((a, b) => (b.dosis_ha > a.dosis_ha ? b : a), items[0]);
          const dosisFinal =
            tipo === 'sustitucion_producto'
              ? items.reduce((s, i) => s + i.dosis_ha, 0)
              : keep.dosis_ha;
          const eliminar = items.filter((i) => i.id !== keep.id).map((i) => i.id);
          if (dosisFinal !== keep.dosis_ha) {
            await supabase.from('plan_productos').update({ dosis_ha: dosisFinal }).eq('id', keep.id);
          }
          await supabase.from('plan_productos').delete().in('id', eliminar);
        }
      }

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
    // En eliminar_producto las filas se borran primero; el registro de auditoría
    // se guarda con plan_producto_id = null (la columna es nullable).
    const esEliminar = tipo === 'eliminar_producto';
    const cambios = (planProductos ?? []).map((pp) => ({
      plan_producto_id: esEliminar ? null : pp.id,
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

    // Eliminar las filas (después de capturar su estado para la auditoría)
    if (esEliminar) {
      const { error } = await supabase.from('plan_productos').delete().in('id', planProductoIds);
      if (error) throw new Error(error.message);
    }

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
