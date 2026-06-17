import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';
import { calcularRedondeoAgregado, calcularResumenCredito, esMecanizacion } from '@/lib/rounding';

interface Lote {
  id: string;
  nombre: string;
  hectareas: number;
}

interface PlanProducto {
  id: string;
  dosis_ha: number;
  lotes_ids: string[] | null;
  precio_override: number | null;
  variante?: { id: string; unidad: string; presentacion: number; precio: number;
    producto?: { id: string; nombre: string; categoria: string } | null;
  } | null;
}

interface Props {
  creditoAprobado: number;
  banco: string | null;
  creditos: { id: string; banco: string; monto_aprobado: number }[];
  plan: { id: string; plan_productos: PlanProducto[] } | null;
  lotes: Lote[];
}

export default function TabCredito({ creditoAprobado, banco, creditos, plan, lotes }: Props) {
  const planProductos = plan?.plan_productos ?? [];

  const categorias: Record<string, { items: { nombre: string; costo: number }[]; total: number }> = {};

  // Agrupar por variante para aplicar un solo ceil por variante
  const varMap = new Map<string, PlanProducto[]>();
  for (const pp of planProductos) {
    if (!pp.variante) continue;
    const vid = pp.variante.id;
    if (!varMap.has(vid)) varMap.set(vid, []);
    varMap.get(vid)!.push(pp);
  }

  for (const [, varPps] of varMap) {
    const v = varPps[0].variante!;
    const cat = v.producto?.categoria ?? 'Otros';
    const { costoTotal } = calcularRedondeoAgregado({
      aplicaciones: varPps.map((pp) => {
        const aplicables = pp.lotes_ids
          ? lotes.filter((l) => pp.lotes_ids!.includes(l.id))
          : lotes;
        return { dosisHa: pp.dosis_ha, hectareas: aplicables.reduce((s, l) => s + l.hectareas, 0), precioOverride: pp.precio_override };
      }),
      presentacion: v.presentacion,
      precio: v.precio,
      redondear: !esMecanizacion(cat),
    });
    if (!categorias[cat]) categorias[cat] = { items: [], total: 0 };
    categorias[cat].items.push({ nombre: v.producto?.nombre ?? 'Producto', costo: costoTotal });
    categorias[cat].total += costoTotal;
  }

  const costoTotal = Object.values(categorias).reduce((s, c) => s + c.total, 0);
  const resumen = calcularResumenCredito({ creditoAprobado, costoTotalPlan: costoTotal });

  return (
    <div className="space-y-6">
      {resumen.estado === 'excedido' && (
        <Alert variant="error" title="Crédito excedido">
          El costo del plan supera el crédito aprobado por{' '}
          <strong>
            ${Math.abs(resumen.delta).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </strong>
        </Alert>
      )}
      {resumen.estado === 'advertencia' && (
        <Alert variant="warning" title="Crédito casi agotado">
          El plan utiliza el {resumen.porcentajeUsado.toFixed(1)}% del crédito aprobado.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500 mb-1">
              Crédito aprobado{creditos.length <= 1 && banco ? ` (${banco})` : ''}
            </p>
            <p className="text-2xl font-bold text-slate-900">
              ${creditoAprobado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </p>
            {creditos.length > 1 && (
              <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                {creditos.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{c.banco}</span>
                    <span className="font-mono text-slate-700">
                      ${c.monto_aprobado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500 mb-1">Costo total del plan</p>
            <p className="text-2xl font-bold text-slate-900">
              ${costoTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500 mb-1">Disponible</p>
            <p className={['text-2xl font-bold', resumen.delta >= 0 ? 'text-green-700' : 'text-rose-600'].join(' ')}>
              {resumen.delta >= 0 ? '+' : ''}${resumen.delta.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Desglose por categoría</h3>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Categoría</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Subtotal</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">% del plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(categorias).map(([cat, data]) => (
                <tr key={cat}>
                  <td className="px-4 py-3 text-slate-900">{cat}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900">
                    ${data.total.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {costoTotal > 0 ? ((data.total / costoTotal) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                  ${costoTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-700">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200">
          <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={[
                'absolute left-0 top-0 h-full rounded-full transition-all',
                resumen.estado === 'excedido' ? 'bg-rose-500' : resumen.estado === 'advertencia' ? 'bg-amber-500' : 'bg-green-500',
              ].join(' ')}
              style={{ width: `${Math.min(resumen.porcentajeUsado, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            {resumen.porcentajeUsado.toFixed(1)}% del crédito utilizado
          </p>
        </div>
      </Card>
    </div>
  );
}
