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
