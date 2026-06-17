import type { ResultadoRedondeo, ResumenCredito } from '@/types';

/**
 * Categorías de mecanización (nivel 1 = "Mecanización"). Su costo NO se redondea
 * a empaque entero — solo los insumos se redondean. El precio por pase ya viene
 * ajustado vía precio_override (factor 40% cuando la maquinaria es del agricultor).
 */
export const MECANIZACION_CATEGORIAS = new Set<string>([
  'Avioneta', 'Coqueo', 'Cosechadora', 'Flete de cosecha', 'Pase de asperjadora',
  'Pase de encaladora', 'Pase de rastra', 'Pase de rotativa', 'Pase de Subsolador',
  'Pase de trompo (Reabono)', 'Personal: labores, comidas, seguridad', 'Sembradora',
]);

export function esMecanizacion(categoria: string | null | undefined): boolean {
  return categoria != null && MECANIZACION_CATEGORIAS.has(categoria);
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
