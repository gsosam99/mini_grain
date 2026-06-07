'use client';

import { useState, useMemo, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import { Plus, Pencil, History } from 'lucide-react';
import { calcularRedondeo } from '@/lib/rounding';
import EditarPlanProductoModal from '@/components/planes/EditarPlanProductoModal';
import AgregarProductoPlanModal from '@/components/planes/AgregarProductoPlanModal';
import CrearPlanModal from '@/components/planes/CrearPlanModal';

interface VarianteConProducto {
  id: string;
  unidad: string;
  presentacion: number;
  precio: number;
  producto: { id: string; nombre: string; categoria: string; subcategoria: string | null;
    proveedor: { id: string; nombre: string } | null;
  } | null;
}

interface PlanProducto {
  id: string;
  dosis_ha: number;
  lotes_ids: string[] | null;
  created_at: string;
  variante: VarianteConProducto | null;
  plan_cambios: {
    id: string; tipo: string; dosis_original: number | null; dosis_nueva: number | null;
    motivo: string | null; fecha: string;
    variante_original: { id: string; unidad: string; presentacion: number; precio: number;
      producto: { id: string; nombre: string } | null;
    } | null;
    variante_nueva: { id: string; unidad: string; presentacion: number; precio: number;
      producto: { id: string; nombre: string } | null;
    } | null;
  }[];
}

interface Lote {
  id: string;
  nombre: string;
  hectareas: number;
}

interface Props {
  plan: { id: string; ciclo: number; plan_productos: PlanProducto[] } | null;
  lotes: Lote[];
  productorId: string;
}

function getHectareasAplicables(pp: PlanProducto, lotes: Lote[]): number {
  const aplicables = pp.lotes_ids
    ? lotes.filter((l) => pp.lotes_ids!.includes(l.id))
    : lotes;
  return aplicables.reduce((s, l) => s + l.hectareas, 0);
}

function agruparPorCategoria(items: PlanProducto[]) {
  const grupos: Record<string, PlanProducto[]> = {};
  for (const item of items) {
    const cat = item.variante?.producto?.categoria ?? 'Sin categoría';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(item);
  }
  return grupos;
}

export default function TabPlan({ plan, lotes, productorId }: Props) {
  const [editando, setEditando] = useState<PlanProducto | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [creandoPlan, setCreandoPlan] = useState(false);
  const [planLocal, setPlanLocal] = useState(plan);

  const handlePlanActualizado = useCallback((nuevoPlan: typeof plan) => {
    setPlanLocal(nuevoPlan);
  }, []);

  const grupos = useMemo(
    () => agruparPorCategoria(planLocal?.plan_productos ?? []),
    [planLocal]
  );

  const totalCosto = useMemo(() => {
    return (planLocal?.plan_productos ?? []).reduce((sum, pp) => {
      if (!pp.variante) return sum;
      const ha = getHectareasAplicables(pp, lotes);
      const { costoTotal } = calcularRedondeo({
        dosisHa: pp.dosis_ha,
        hectareas: ha,
        presentacion: pp.variante.presentacion,
        precio: pp.variante.precio,
      });
      return sum + costoTotal;
    }, 0);
  }, [planLocal, lotes]);

  if (!planLocal) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 mb-4">Este productor no tiene un plan agrícola creado para el ciclo 2026.</p>
        <Button onClick={() => setCreandoPlan(true)}>
          <Plus size={16} />
          Crear plan 2026
        </Button>
        {creandoPlan && (
          <CrearPlanModal
            open={creandoPlan}
            productorId={productorId}
            onClose={() => setCreandoPlan(false)}
            onCreado={handlePlanActualizado}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Plan ciclo {planLocal.ciclo} ·{' '}
            <span className="font-semibold text-slate-900">
              Costo total: ${totalCosto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </span>
          </p>
        </div>
        <Button size="sm" onClick={() => setAgregando(true)}>
          <Plus size={14} />
          Agregar producto
        </Button>
      </div>

      {Object.entries(grupos).map(([categoria, items]) => {
        const subtotal = items.reduce((sum, pp) => {
          if (!pp.variante) return sum;
          const ha = getHectareasAplicables(pp, lotes);
          const { costoTotal } = calcularRedondeo({
            dosisHa: pp.dosis_ha,
            hectareas: ha,
            presentacion: pp.variante.presentacion,
            precio: pp.variante.precio,
          });
          return sum + costoTotal;
        }, 0);

        return (
          <Card key={categoria}>
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">{categoria}</h3>
              <span className="text-sm font-mono text-slate-700">
                ${subtotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="text-left px-4 py-2 font-medium">Producto</th>
                    <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                    <th className="text-left px-4 py-2 font-medium">Subcategoría</th>
                    <th className="text-right px-4 py-2 font-medium">Dosis/Ha</th>
                    <th className="text-right px-4 py-2 font-medium">Ha aplicables</th>
                    <th className="text-right px-4 py-2 font-medium">Total s/redondear</th>
                    <th className="text-left px-4 py-2 font-medium">Presentación</th>
                    <th className="text-right px-4 py-2 font-medium">Redondeo</th>
                    <th className="text-right px-4 py-2 font-medium">Precio u.</th>
                    <th className="text-right px-4 py-2 font-medium">Costo total</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((pp) => {
                    if (!pp.variante || !pp.variante.producto) return null;
                    const ha = getHectareasAplicables(pp, lotes);
                    const { totalSinRedondear, unidadesNecesarias, costoTotal } = calcularRedondeo({
                      dosisHa: pp.dosis_ha,
                      hectareas: ha,
                      presentacion: pp.variante.presentacion,
                      precio: pp.variante.precio,
                    });
                    const tieneCambios = pp.plan_cambios.length > 0;
                    const soloAlgunosLotes = pp.lotes_ids !== null;

                    return (
                      <tr key={pp.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-900">
                              {pp.variante.producto.nombre}
                            </span>
                            {tieneCambios && (
                              <History size={12} className="text-amber-500 shrink-0" />
                            )}
                            {soloAlgunosLotes && (
                              <Badge variant="blue" className="text-xs">
                                {pp.lotes_ids!.length} lotes
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-slate-500">
                          {pp.variante.producto.proveedor?.nombre ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-slate-500">
                          {pp.variante.producto.subcategoria ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-900">
                          {pp.dosis_ha.toLocaleString('es-VE', { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">
                          {ha.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">
                          {totalSinRedondear.toLocaleString('es-VE', { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {pp.variante.presentacion} {pp.variante.unidad}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-slate-900">
                          {unidadesNecesarias}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">
                          ${pp.variante.precio.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-green-700">
                          ${costoTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => setEditando(pp)}
                            className="text-slate-400 hover:text-green-700 transition-colors"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      {editando && (
        <EditarPlanProductoModal
          open={!!editando}
          planProducto={editando as Parameters<typeof EditarPlanProductoModal>[0]['planProducto']}
          lotes={lotes}
          onClose={() => setEditando(null)}
          onGuardado={(planActualizado) => {
            setPlanLocal(planActualizado as unknown as typeof planLocal);
            setEditando(null);
          }}
          planId={planLocal.id}
        />
      )}

      {agregando && (
        <AgregarProductoPlanModal
          open={agregando}
          planId={planLocal.id}
          lotes={lotes}
          productorId={productorId}
          onClose={() => setAgregando(false)}
          onAgregado={(planActualizado) => {
            setPlanLocal(planActualizado as unknown as typeof planLocal);
            setAgregando(false);
          }}
        />
      )}
    </div>
  );
}
