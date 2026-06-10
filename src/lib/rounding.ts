import type { ResultadoRedondeo, ResumenCredito } from '@/types';

export function calcularRedondeo(params: {
  dosisHa: number;
  hectareas: number;
  presentacion: number;
  precio: number;
}): ResultadoRedondeo {
  const totalSinRedondear = params.dosisHa * params.hectareas;
  const unidadesNecesarias =
    params.presentacion > 0 ? Math.ceil(totalSinRedondear / params.presentacion) : 0;
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
}): ResultadoRedondeo {
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
    const unidades =
      params.presentacion > 0 ? Math.ceil(totalGrupo / params.presentacion) : 0;
    totalSinRedondear += totalGrupo;
    unidadesNecesarias += unidades;
    costoTotal += unidades * precioGrupo;
  }

  return { totalSinRedondear, unidadesNecesarias, costoTotal };
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
