import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { ArrowRight } from 'lucide-react';

interface PlanCambio {
  id: string;
  tipo: string;
  dosis_original: number | null;
  dosis_nueva: number | null;
  motivo: string | null;
  fecha: string;
  variante_original: { id: string; unidad: string; presentacion: number; precio: number;
    producto: { id: string; nombre: string } | null;
  } | null;
  variante_nueva: { id: string; unidad: string; presentacion: number; precio: number;
    producto: { id: string; nombre: string } | null;
  } | null;
}

interface PlanProducto {
  id: string;
  variante: { producto: { nombre: string } | null } | null;
  plan_cambios: PlanCambio[];
}

interface Props {
  plan: { plan_productos: PlanProducto[] } | null;
}

const tipoLabel: Record<string, { label: string; variant: 'yellow' | 'red' | 'blue' | 'gray' }> = {
  sustitucion_producto: { label: 'Sustitución de producto', variant: 'red' },
  cambio_variante: { label: 'Cambio de variante', variant: 'yellow' },
  cambio_precio: { label: 'Cambio de precio', variant: 'blue' },
  cambio_dosis: { label: 'Cambio de dosis', variant: 'gray' },
};

export default function TabCambios({ plan }: Props) {
  const cambios: (PlanCambio & { productoNombre: string })[] = [];

  for (const pp of plan?.plan_productos ?? []) {
    for (const cambio of pp.plan_cambios) {
      cambios.push({
        ...cambio,
        productoNombre: pp.variante?.producto?.nombre ?? 'Producto eliminado',
      });
    }
  }

  cambios.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  if (cambios.length === 0) {
    return (
      <Card>
        <div className="py-12 text-center text-slate-400 text-sm">
          Sin cambios logísticos registrados en este plan.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-600">Fecha</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Producto</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Cambio</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Δ Costo</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cambios.map((c) => {
              const { label, variant } = tipoLabel[c.tipo] ?? { label: c.tipo, variant: 'gray' };
              const costoOriginal =
                c.variante_original ? c.variante_original.precio : null;
              const costoNuevo =
                c.variante_nueva ? c.variante_nueva.precio : null;
              const deltaCosto =
                costoOriginal !== null && costoNuevo !== null ? costoNuevo - costoOriginal : null;

              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(c.fecha).toLocaleDateString('es-VE', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{c.productoNombre}</td>
                  <td className="px-4 py-3">
                    <Badge variant={variant}>{label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.variante_original && c.variante_nueva ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="line-through text-slate-400">
                          {c.variante_original.presentacion}{c.variante_original.unidad} · ${c.variante_original.precio}
                        </span>
                        <ArrowRight size={12} className="shrink-0" />
                        <span>
                          {c.variante_nueva.presentacion}{c.variante_nueva.unidad} · ${c.variante_nueva.precio}
                        </span>
                      </div>
                    ) : c.dosis_original !== null && c.dosis_nueva !== null ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="line-through text-slate-400">{c.dosis_original}</span>
                        <ArrowRight size={12} className="shrink-0" />
                        <span>{c.dosis_nueva}</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className={['px-4 py-3 text-right font-mono text-xs font-semibold', deltaCosto !== null && deltaCosto > 0 ? 'text-rose-600' : 'text-green-700'].join(' ')}>
                    {deltaCosto !== null
                      ? (deltaCosto >= 0 ? '+' : '') + '$' + deltaCosto.toLocaleString('es-VE', { minimumFractionDigits: 2 })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">
                    {c.motivo ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
