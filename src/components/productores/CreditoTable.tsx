'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import SortableHeader from '@/components/ui/SortableHeader';
import { useSortable, applySortable } from '@/hooks/useSortable';
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
    plan: { productor_id: string } | null;
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
    if (!pp.variante || pp.plan?.productor_id !== productorId) return sum;
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

type SortKey = 'nombre' | 'estado' | 'banco' | 'credito' | 'costo' | 'delta';

export default function CreditoTable({ productores, lotes, planProductos }: Props) {
  const { sort, toggle } = useSortable<SortKey>('nombre');

  const rows = useMemo(() => {
    const base = productores.map((p) => {
      const costo = calcularCostoProductor(p.id, lotes, planProductos);
      const resumen = calcularResumenCredito({ creditoAprobado: p.credito_aprobado, costoTotalPlan: costo });
      return { ...p, costo, resumen };
    });
    return applySortable(base, sort, (row, key) => ({
      nombre: row.nombre,
      estado: row.estado ?? '',
      banco: row.banco ?? '',
      credito: row.credito_aprobado,
      costo: row.costo,
      delta: row.resumen.delta,
    }[key]));
  }, [productores, lotes, planProductos, sort]);

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <SortableHeader label="Productor" sortKey="nombre" currentKey={sort.key} dir={sort.dir} onSort={toggle} />
              <SortableHeader label="Estado" sortKey="estado" currentKey={sort.key} dir={sort.dir} onSort={toggle} />
              <SortableHeader label="Banco" sortKey="banco" currentKey={sort.key} dir={sort.dir} onSort={toggle} />
              <SortableHeader label="Crédito aprobado" sortKey="credito" currentKey={sort.key} dir={sort.dir} onSort={toggle} align="right" />
              <SortableHeader label="Costo plan" sortKey="costo" currentKey={sort.key} dir={sort.dir} onSort={toggle} align="right" />
              <SortableHeader label="Delta" sortKey="delta" currentKey={sort.key} dir={sort.dir} onSort={toggle} align="right" />
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-slate-500">Estado crédito</th>
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
