'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import SortableHeader from '@/components/ui/SortableHeader';
import { useSortable, applySortable } from '@/hooks/useSortable';
import { calcularRedondeoAgregado, calcularResumenCredito } from '@/lib/rounding';

type EstadoCredito = 'ok' | 'advertencia' | 'excedido';
type FiltroEstado = 'todos' | EstadoCredito;

const FILTROS: { id: FiltroEstado; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'ok', label: 'OK' },
  { id: 'advertencia', label: 'Atención' },
  { id: 'excedido', label: 'Excedidos' },
];

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

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
    precio_override: number | null;
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

  // Agrupar por variante para aplicar UN SOLO ceil por variante
  const varMap = new Map<string, Props['planProductos']>();
  for (const pp of planProductos) {
    if (!pp.variante || pp.plan?.productor_id !== productorId) continue;
    const vid = pp.variante.id;
    if (!varMap.has(vid)) varMap.set(vid, []);
    varMap.get(vid)!.push(pp);
  }

  return [...varMap.values()].reduce((total, varPps) => {
    const v = varPps[0].variante!;
    const { costoTotal } = calcularRedondeoAgregado({
      aplicaciones: varPps.map((pp) => {
        const lotesAplicables = pp.lotes_ids
          ? productorLotes.filter((l) => pp.lotes_ids!.includes(l.id))
          : productorLotes;
        return { dosisHa: pp.dosis_ha, hectareas: lotesAplicables.reduce((s, l) => s + l.hectareas, 0), precioOverride: pp.precio_override };
      }),
      presentacion: v.presentacion,
      precio: v.precio,
    });
    return total + costoTotal;
  }, 0);
}

type SortKey = 'nombre' | 'estado' | 'banco' | 'credito' | 'costo' | 'delta';

export default function CreditoTable({ productores, lotes, planProductos }: Props) {
  const { sort, toggle } = useSortable<SortKey>('nombre');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');

  const todos = useMemo(() => {
    return productores.map((p) => {
      const costo = calcularCostoProductor(p.id, lotes, planProductos);
      const resumen = calcularResumenCredito({ creditoAprobado: p.credito_aprobado, costoTotalPlan: costo });
      return { ...p, costo, resumen };
    });
  }, [productores, lotes, planProductos]);

  // Conteos por estado (para los chips de filtro)
  const conteos = useMemo(() => {
    const c = { todos: todos.length, ok: 0, advertencia: 0, excedido: 0 };
    for (const r of todos) c[r.resumen.estado]++;
    return c;
  }, [todos]);

  const rows = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const filtradas = todos.filter((r) => {
      if (filtro !== 'todos' && r.resumen.estado !== filtro) return false;
      if (q && !normalizar(r.nombre).includes(q)) return false;
      return true;
    });
    return applySortable(filtradas, sort, (row, key) => ({
      nombre: row.nombre,
      estado: row.estado ?? '',
      banco: row.banco ?? '',
      credito: row.credito_aprobado,
      costo: row.costo,
      delta: row.resumen.delta,
    }[key]));
  }, [todos, busqueda, filtro, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar productor..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors',
                filtro === f.id
                  ? 'border-green-600 bg-green-50 text-green-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {f.label} <span className="text-slate-400">({conteos[f.id]})</span>
            </button>
          ))}
        </div>
      </div>

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
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  No hay productores que coincidan con la búsqueda o filtro.
                </td>
              </tr>
            )}
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
    </div>
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
