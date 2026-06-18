import Card from '@/components/ui/Card';
import { Users, MapPin, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { calcularRedondeoAgregado, esServicio } from '@/lib/rounding';

interface DashboardStatsProps {
  productores: { id: string; credito_aprobado: number }[];
  lotes: { id: string; productor_id: string; hectareas: number }[];
  planProductos: {
    id: string;
    dosis_ha: number;
    lotes_ids: string[] | null;
    precio_override: number | null;
    hectareas: number | null;
    plan: { productor_id: string } | null;
    variante: { id: string; presentacion: number; precio: number; unidad: string } | null;
  }[];
}

function calcularCostoPorProductor(
  productorId: string,
  lotes: DashboardStatsProps['lotes'],
  planProductos: DashboardStatsProps['planProductos']
): number {
  const productorLotes = lotes.filter((l) => l.productor_id === productorId);

  // Agrupar por variante para aplicar UN SOLO ceil por variante (igual que el Excel maestro)
  const varMap = new Map<string, DashboardStatsProps['planProductos']>();
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

export default function DashboardStats({ productores, lotes, planProductos }: DashboardStatsProps) {
  const totalHa = lotes.reduce((sum, l) => sum + l.hectareas, 0);
  const totalCredito = productores.reduce((sum, p) => sum + p.credito_aprobado, 0);

  const totalCostoPlan = productores.reduce(
    (sum, p) => sum + calcularCostoPorProductor(p.id, lotes, planProductos),
    0
  );

  const excedidos = productores.filter(
    (p) => calcularCostoPorProductor(p.id, lotes, planProductos) > p.credito_aprobado
  ).length;

  // Balance global
  const delta = totalCostoPlan - totalCredito;
  const cobertura = totalCredito > 0 ? (totalCostoPlan / totalCredito) * 100 : 0;
  const barraWidth = Math.min(cobertura, 100);
  const esDeficit = delta > 0;
  const barraColor =
    cobertura < 80 ? 'bg-green-500' : cobertura < 100 ? 'bg-amber-400' : 'bg-rose-500';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

      {/* KPI — Productores */}
      <Card>
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">Productores</p>
            <div className="rounded-lg p-2 bg-blue-50">
              <Users size={18} className="text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{productores.length}</p>
          {excedidos > 0 && (
            <p className="text-xs text-rose-600 mt-1">
              {excedidos} excede{excedidos > 1 ? 'n' : ''} su crédito
            </p>
          )}
        </div>
      </Card>

      {/* KPI — Hectáreas */}
      <Card>
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">Hectáreas totales</p>
            <div className="rounded-lg p-2 bg-green-50">
              <MapPin size={18} className="text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {totalHa.toLocaleString('es-VE', { maximumFractionDigits: 1 })}
          </p>
        </div>
      </Card>

      {/* Balance card — col-span-2 on lg, full width on mobile */}
      <Card className="lg:col-span-2">
        <div className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Delta */}
            <div className="flex items-center gap-3">
              <div className={['rounded-lg p-2 shrink-0', esDeficit ? 'bg-rose-50' : 'bg-green-50'].join(' ')}>
                {esDeficit
                  ? <AlertTriangle size={18} className="text-rose-600" />
                  : <CheckCircle2 size={18} className="text-green-600" />}
              </div>
              <div>
                <p className="text-sm text-slate-500">Balance del proyecto</p>
                <p className={['text-xl font-bold', esDeficit ? 'text-rose-600' : 'text-green-700'].join(' ')}>
                  {esDeficit ? '−' : '+'}$
                  {Math.abs(delta).toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    {esDeficit ? 'déficit' : 'margen'}
                  </span>
                </p>
              </div>
            </div>

            {/* Crédito vs Costo */}
            <div className="flex items-center gap-5 text-sm shrink-0">
              <div>
                <p className="text-slate-400 text-xs mb-0.5">Crédito aprobado</p>
                <p className="font-semibold text-slate-700 tabular-nums">
                  ${totalCredito.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <span className="text-slate-300">→</span>
              <div>
                <p className="text-slate-400 text-xs mb-0.5">Costo del plan</p>
                <p className={['font-semibold tabular-nums', esDeficit ? 'text-rose-600' : 'text-slate-700'].join(' ')}>
                  ${totalCostoPlan.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-slate-400">
                El plan consume el{' '}
                <span className={['font-semibold', esDeficit ? 'text-rose-600' : 'text-slate-700'].join(' ')}>
                  {cobertura.toLocaleString('es-VE', { maximumFractionDigits: 1 })}%
                </span>
                {' '}del crédito total
              </p>
              {esDeficit && (
                <p className="text-xs text-rose-600 font-medium">
                  Solicitá ${Math.abs(delta).toLocaleString('es-VE', { maximumFractionDigits: 0 })} adicionales
                </p>
              )}
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={['h-full rounded-full', barraColor].join(' ')}
                style={{ width: `${barraWidth}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-slate-300">0%</span>
              <span className="text-[10px] text-slate-300">100%</span>
            </div>
          </div>
        </div>
      </Card>

    </div>
  );
}
