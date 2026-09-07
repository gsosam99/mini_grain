import type { ResultadoRedondeo, ResumenCredito } from '@/types';

/**
 * Solo los insumos FÍSICOS (que se compran por empaque) se redondean a empaque
 * entero. Los servicios — Mecanización, Tecnología & Asistencia Técnica, Fletes,
 * Financiamiento — NO se redondean; su costo es la cantidad fraccionada × precio.
 * El marcador técnico de un servicio es `unidad === 'servicio'`.
 */
export function esServicio(unidad: string | null | undefined): boolean {
  return unidad === 'servicio';
}

export function calcularRedondeo(params: {
  dosisHa: number;
  hectareas: number;
  presentacion: number;
  precio: number;
  /** false = no redondear a empaque entero (mecanización). Default true. */
  redondear?: boolean;
}): ResultadoRedondeo {
  const redondear = params.redondear ?? true;
  const totalSinRedondear = params.dosisHa * params.hectareas;
  const cruda = params.presentacion > 0 ? totalSinRedondear / params.presentacion : 0;
  const unidadesNecesarias = redondear ? Math.ceil(cruda) : cruda;
  const costoTotal = unidadesNecesarias * params.precio;
  return { totalSinRedondear, unidadesNecesarias, costoTotal };
}

/**
 * Versión agregada: suma todos los (dosisHa × ha) y aplica el ceil UNA SOLA VEZ
 * sobre el total acumulado, igual al comportamiento del Excel maestro.
 * Usar siempre que se consoliden múltiples plan_productos del mismo variante.
 *
 * Cuando una aplicación tiene `precioOverride`, se agrupa por precio y se aplica
 * un ceil independiente por grupo — permite precios por lote en mecanización.
 */
export function calcularRedondeoAgregado(params: {
  aplicaciones: { dosisHa: number; hectareas: number; precioOverride?: number | null }[];
  presentacion: number;
  precio: number;
  /** false = no redondear a empaque entero (mecanización). Default true. */
  redondear?: boolean;
}): ResultadoRedondeo {
  const redondear = params.redondear ?? true;
  // Separar aplicaciones con precio_override de las que usan el precio base
  const grupos = new Map<number, number>(); // precio → totalSinRedondear acumulado

  for (const a of params.aplicaciones) {
    const precioEfectivo = a.precioOverride ?? params.precio;
    const prev = grupos.get(precioEfectivo) ?? 0;
    grupos.set(precioEfectivo, prev + a.dosisHa * a.hectareas);
  }

  let totalSinRedondear = 0;
  let costoTotal = 0;
  let unidadesNecesarias = 0;

  for (const [precioGrupo, totalGrupo] of grupos) {
    const cruda = params.presentacion > 0 ? totalGrupo / params.presentacion : 0;
    const unidades = redondear ? Math.ceil(cruda) : cruda;
    totalSinRedondear += totalGrupo;
    unidadesNecesarias += unidades;
    costoTotal += unidades * precioGrupo;
  }

  return { totalSinRedondear, unidadesNecesarias, costoTotal };
}

export interface PlanProductoParaCosto {
  id: string;
  dosis_ha: number;
  lotes_ids: string[] | null;
  precio_override: number | null;
  hectareas: number | null;
  plan: { productor_id: string } | null;
  variante: { id: string; presentacion: number; precio: number; unidad: string } | null;
}

/**
 * Costo total del plan de un productor: agrupa sus plan_productos por variante
 * y aplica UN SOLO ceil por variante (igual que el Excel maestro).
 */
export function calcularCostoPorProductor(
  productorId: string,
  lotes: { id: string; productor_id: string; hectareas: number }[],
  planProductos: PlanProductoParaCosto[]
): number {
  const productorLotes = lotes.filter((l) => l.productor_id === productorId);

  const varMap = new Map<string, PlanProductoParaCosto[]>();
  for (const pp of planProductos) {
    if (!pp.variante || pp.plan?.productor_id !== productorId) continue;
    const vid = pp.variante.id;
    if (!varMap.has(vid)) varMap.set(vid, []);
    varMap.get(vid)!.push(pp);
  }

  return [...varMap.values()].reduce((total, varPps) => {
    const v = varPps[0].variante!;
    const aplicaciones = varPps.map((pp) => {
      const lotesAplicables = pp.lotes_ids
        ? productorLotes.filter((l) => pp.lotes_ids!.includes(l.id))
        : productorLotes;
      const hectareas = pp.hectareas ?? lotesAplicables.reduce((s, l) => s + l.hectareas, 0);
      return { dosisHa: pp.dosis_ha, hectareas, precioOverride: pp.precio_override };
    });
    const { costoTotal } = calcularRedondeoAgregado({
      aplicaciones,
      presentacion: v.presentacion,
      precio: v.precio,
      redondear: !esServicio(v.unidad),
    });
    return total + costoTotal;
  }, 0);
}

export function calcularResumenCredito(params: {
  creditoAprobado: number;
  costoTotalPlan: number;
}): ResumenCredito {
  const { creditoAprobado, costoTotalPlan } = params;
  const delta = creditoAprobado - costoTotalPlan;
  const porcentajeUsado = creditoAprobado > 0 ? (costoTotalPlan / creditoAprobado) * 100 : 0;

  let estado: ResumenCredito['estado'];
  if (delta < 0) {
    estado = 'excedido';
  } else if (porcentajeUsado >= 90) {
    estado = 'advertencia';
  } else {
    estado = 'ok';
  }

  return { creditoAprobado, costoTotalPlan, delta, porcentajeUsado, estado };
}

export function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

export function formatearNumero(valor: number, decimales = 2): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}
