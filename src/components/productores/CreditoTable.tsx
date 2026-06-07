import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { calcularRedondeo, calcularResumenCredito } from '@/lib/rounding';

interface Props {
  productores: {
    id: string;
    nombre: string;
    banco: string | null;
    credito_aprobado: number;
    estado: string | null;
  }[];
  lotes: { id: string; productor_id: string; hectareas: number }[];
  planProductos: {
    id: string;
    dosis_ha: number;
    lotes_ids: string[] | null;
    variante: { id: string; presentacion: number; precio: number } | null;
  }[];
}

function calcularCostoProductor(
  productorId: string,
  lotes: Props['lotes'],
  planProductos: Props['planProductos']
): number {
  const productorLotes = lotes.filter((l) => l.productor_id === productorId);
  return planProductos.reduce((sum, pp) => {
    if (!pp.variante) return sum;
    const lotesAplicables = pp.lotes_ids
      ? productorLotes.filter((l) => pp.lotes_ids!.includes(l.id))
      : productorLotes;
    const ha = lotesAplicables.reduce((s, l) => s + l.hectareas, 0);
    if (ha === 0) return sum;
    const { costoTotal } = calcularRedondeo({
      dosisHa: pp.dosis_ha,
      hectareas: ha,
      presentacion: pp.variante.presentacion,
      precio: pp.variante.precio,
    });
    return sum + costoTotal;
  }, 0);
}

export default function CreditoTable({ productores, lotes, planProductos }: Props) {
  const rows = productores.map((p) => {
    const costo = calcularCostoProductor(p.id, lotes, planProductos);
    const resumen = calcularResumenCredito({
      creditoAprobado: p.credito_aprobado,
      costoTotalPlan: costo,
    });
    return { ...p, costo, resumen };
  });

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-600">Productor</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Banco</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Crédito aprobado</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Costo plan</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Delta</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600">Estado crédito</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/productores/${row.id}`}
                    className="font-medium text-slate-900 hover:text-green-700 transition-colors"
                  >
                    {row.nombre}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.estado ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{row.banco ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-900">
                  ${row.credito_aprobado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-900">
                  ${row.costo.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </td>
                <td className={['px-4 py-3 text-right font-mono font-semibold', row.resumen.delta < 0 ? 'text-rose-600' : 'text-green-700'].join(' ')}>
                  {row.resumen.delta >= 0 ? '+' : ''}${row.resumen.delta.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-center">
                  <CreditoBadge estado={row.resumen.estado} porcentaje={row.resumen.porcentajeUsado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CreditoBadge({
  estado,
  porcentaje,
}: {
  estado: 'ok' | 'advertencia' | 'excedido';
  porcentaje: number;
}) {
  if (estado === 'excedido') return <Badge variant="red">Excedido ({porcentaje.toFixed(0)}%)</Badge>;
  if (estado === 'advertencia') return <Badge variant="yellow">Atención ({porcentaje.toFixed(0)}%)</Badge>;
  return <Badge variant="green">OK ({porcentaje.toFixed(0)}%)</Badge>;
}
