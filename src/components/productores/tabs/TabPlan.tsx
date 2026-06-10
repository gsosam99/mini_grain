'use client';

import { Fragment, useState, useMemo, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Plus, Pencil, History, ChevronDown, ChevronRight } from 'lucide-react';
import SortableHeader from '@/components/ui/SortableHeader';
import { useSortable, applySortable } from '@/hooks/useSortable';
import { calcularRedondeo, calcularRedondeoAgregado } from '@/lib/rounding';
import EditarPlanProductoModal from '@/components/planes/EditarPlanProductoModal';
import AgregarProductoPlanModal from '@/components/planes/AgregarProductoPlanModal';
import CrearPlanModal from '@/components/planes/CrearPlanModal';

interface VarianteConProducto {
  id: string;
  unidad: string;
  presentacion: number;
  precio: number;
  producto: {
    id: string;
    nombre: string;
    categoria: string;
    subcategoria: string | null;
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

// ─── helpers ────────────────────────────────────────────────────────────────

function getHectareasAplicables(pp: PlanProducto, lotes: Lote[]): number {
  const aplicables = pp.lotes_ids
    ? lotes.filter((l) => pp.lotes_ids!.includes(l.id))
    : lotes;
  return aplicables.reduce((s, l) => s + l.hectareas, 0);
}

function getLoteLabel(pp: PlanProducto, lotes: Lote[]): string {
  if (pp.lotes_ids === null) return 'Todos los lotes';
  const nombres = pp.lotes_ids.map((id) => lotes.find((l) => l.id === id)?.nombre ?? '—');
  if (nombres.length === 0) return 'Sin lotes';
  if (nombres.length <= 2) return nombres.join(', ');
  return `${nombres[0]}, ${nombres[1]} +${nombres.length - 2} más`;
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

// ─── types ───────────────────────────────────────────────────────────────────

type PlanSortKey = 'producto' | 'proveedor' | 'subcategoria' | 'ha' | 'cantidad' | 'costo';

interface AplicacionDetalle {
  pp: PlanProducto;
  loteLabel: string;
  ha: number;
  dosis: number;
  varianteLabel: string;
  precioUnitario: number;
  unidades: number;
  /** Cantidad física = unidades × presentacion (en la unidad base del producto) */
  cantidadFisica: number;
  unidad: string;
  costo: number;
  tieneCambios: boolean;
}

interface AggRow {
  productId: string;
  nombre: string;
  subcategoria: string | null;
  proveedor: string | null;
  totalHa: number;
  totalUnidades: number;
  /** Suma de cantidadFisica de todas las aplicaciones */
  totalCantidadFisica: number;
  /** Unidad de medida si todas las aplicaciones usan la misma; null si hay mezcla */
  unidadComun: string | null;
  totalCosto: number;
  aplicaciones: AplicacionDetalle[];
}

// ─── aggregate builder ───────────────────────────────────────────────────────

function buildAggRows(items: PlanProducto[], lotes: Lote[]): AggRow[] {
  // Paso 1 — agrupar por producto
  const map = new Map<string, PlanProducto[]>();
  for (const pp of items) {
    const key = pp.variante?.producto?.id ?? pp.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(pp);
  }

  const rows: AggRow[] = [];
  for (const [productId, pps] of map) {
    const first = pps.find((p) => p.variante?.producto) ?? pps[0];
    const nombre = first.variante?.producto?.nombre ?? '—';
    const subcategoria = first.variante?.producto?.subcategoria ?? null;
    const proveedor = first.variante?.producto?.proveedor?.nombre ?? null;

    // Paso 2 — sub-agrupar por variante para aplicar UN SOLO ceil por variante
    const varMap = new Map<string, PlanProducto[]>();
    for (const pp of pps) {
      const vid = pp.variante?.id ?? pp.id;
      if (!varMap.has(vid)) varMap.set(vid, []);
      varMap.get(vid)!.push(pp);
    }

    let totalHa = 0;
    let totalUnidades = 0;
    let totalCantidadFisica = 0;
    let totalCosto = 0;
    const unidadesVistas = new Set<string>();
    const aplicaciones: AplicacionDetalle[] = [];

    for (const [, varPps] of varMap) {
      const v = varPps.find((p) => p.variante)?.variante;
      if (!v) continue;

      // Acumular raw (dosis × ha) por plan_producto y calcular el ceil del total acumulado
      const ppRaws = varPps.map((pp) => {
        const ha = getHectareasAplicables(pp, lotes);
        return { pp, ha, raw: pp.dosis_ha * ha };
      });

      const rawTotal = ppRaws.reduce((s, d) => s + d.raw, 0);
      const { unidadesNecesarias, costoTotal } = calcularRedondeoAgregado({
        aplicaciones: ppRaws.map((d) => ({ dosisHa: d.pp.dosis_ha, hectareas: d.ha, precioOverride: d.pp.precio_override })),
        presentacion: v.presentacion,
        precio: v.precio,
      });
      const cantidadFisicaVariante = unidadesNecesarias * v.presentacion;

      totalUnidades += unidadesNecesarias;
      totalCantidadFisica += cantidadFisicaVariante;
      totalCosto += costoTotal;
      unidadesVistas.add(v.unidad);

      // Filas de detalle: demanda física real del lote (sin redondear por lote)
      // El costo se distribuye proporcionalmente para que la suma coincida con el total
      for (const { pp, ha, raw } of ppRaws) {
        totalHa += ha;
        const frac = rawTotal > 0 ? raw / rawTotal : 0;
        aplicaciones.push({
          pp,
          loteLabel: getLoteLabel(pp, lotes),
          ha,
          dosis: pp.dosis_ha,
          varianteLabel: `${v.presentacion} ${v.unidad}`,
          precioUnitario: v.precio,
          unidades: frac * unidadesNecesarias,
          cantidadFisica: raw,           // demanda real del lote, sin redondeo
          unidad: v.unidad,
          costo: frac * costoTotal,      // proporcional al costo total redondeado
          tieneCambios: pp.plan_cambios.length > 0,
        });
      }
    }

    const unidadComun = unidadesVistas.size === 1 ? [...unidadesVistas][0] : null;

    rows.push({
      productId, nombre, subcategoria, proveedor,
      totalHa, totalUnidades, totalCantidadFisica, unidadComun, totalCosto,
      aplicaciones,
    });
  }
  return rows;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function TabPlan({ plan, lotes, productorId }: Props) {
  const [editando, setEditando] = useState<PlanProducto | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [creandoPlan, setCreandoPlan] = useState(false);
  const [planLocal, setPlanLocal] = useState(plan);
  // Categorías cerradas (vacío = todas abiertas)
  const [cerradas, setCerradas] = useState<Set<string>>(new Set());
  // Productos expandidos para ver desglose por lote
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  // Sorting compartido entre todas las categorías
  const { sort: planSort, toggle: planToggle } = useSortable<PlanSortKey>('producto');

  const toggleCategoria = useCallback((cat: string) => {
    setCerradas((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }, []);

  const toggleProduct = useCallback((productId: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });
  }, []);

  const handlePlanActualizado = useCallback((nuevoPlan: typeof plan) => {
    setPlanLocal(nuevoPlan);
  }, []);

  const grupos = useMemo(
    () => agruparPorCategoria(planLocal?.plan_productos ?? []),
    [planLocal],
  );

  const totalCosto = useMemo(() => {
    return buildAggRows(planLocal?.plan_productos ?? [], lotes)
      .reduce((sum, row) => sum + row.totalCosto, 0);
  }, [planLocal, lotes]);

  if (!planLocal) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 mb-4">
          Este productor no tiene un plan agrícola creado para el ciclo 2026.
        </p>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Plan ciclo {planLocal.ciclo} ·{' '}
          <span className="font-semibold text-slate-900">
            Costo total: ${totalCosto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </span>
        </p>
        <Button size="sm" onClick={() => setAgregando(true)}>
          <Plus size={14} />
          Agregar producto
        </Button>
      </div>

      {/* Category accordions */}
      {Object.entries(grupos).map(([categoria, items]) => {
        const isCerrada = cerradas.has(categoria);

        // Build aggregate rows (1 per unique product) and sort them
        const aggRows = buildAggRows(items, lotes);
        const subtotal = aggRows.reduce((sum, row) => sum + row.totalCosto, 0);
        const aggRowsSorted = applySortable(aggRows, planSort, (row, key) => (
          ({
            producto: row.nombre,
            proveedor: row.proveedor ?? '',
            subcategoria: row.subcategoria ?? '',
            ha: row.totalHa,
            cantidad: row.totalCantidadFisica,
            costo: row.totalCosto,
          } as Record<string, string | number>)[key]
        ));

        return (
          <Card key={categoria}>
            {/* Category header — clickable to collapse */}
            <button
              onClick={() => toggleCategoria(categoria)}
              className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors rounded-t-xl"
            >
              <div className="flex items-center gap-2">
                <ChevronDown
                  size={15}
                  className={[
                    'text-slate-400 transition-transform duration-200',
                    isCerrada ? '-rotate-90' : '',
                  ].join(' ')}
                />
                <h3 className="text-sm font-semibold text-slate-700">{categoria}</h3>
                <span className="text-xs text-slate-400">
                  {aggRows.length} {aggRows.length === 1 ? 'producto' : 'productos'}
                </span>
              </div>
              <span className="text-sm font-mono text-slate-700">
                ${subtotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </span>
            </button>

            {/* Accordion body — grid trick for smooth animation */}
            <div
              className="grid transition-[grid-template-rows] duration-200 ease-out"
              style={{ gridTemplateRows: isCerrada ? '0fr' : '1fr' }}
            >
              <div className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {/* expand-toggle column */}
                        <th className="w-8 px-2 py-2" />
                        <SortableHeader
                          label="Producto"
                          sortKey="producto"
                          currentKey={planSort.key}
                          dir={planSort.dir}
                          onSort={planToggle}
                          className="text-xs"
                        />
                        <SortableHeader
                          label="Subcategoría"
                          sortKey="subcategoria"
                          currentKey={planSort.key}
                          dir={planSort.dir}
                          onSort={planToggle}
                          className="text-xs"
                        />
                        <SortableHeader
                          label="Proveedor"
                          sortKey="proveedor"
                          currentKey={planSort.key}
                          dir={planSort.dir}
                          onSort={planToggle}
                          className="text-xs"
                        />
                        <SortableHeader
                          label="Ha totales"
                          sortKey="ha"
                          currentKey={planSort.key}
                          dir={planSort.dir}
                          onSort={planToggle}
                          align="right"
                          className="text-xs"
                        />
                        <SortableHeader
                          label="Cantidad"
                          sortKey="cantidad"
                          currentKey={planSort.key}
                          dir={planSort.dir}
                          onSort={planToggle}
                          align="right"
                          className="text-xs"
                        />
                        <SortableHeader
                          label="Costo total"
                          sortKey="costo"
                          currentKey={planSort.key}
                          dir={planSort.dir}
                          onSort={planToggle}
                          align="right"
                          className="text-xs"
                        />
                        <th className="w-8 px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {aggRowsSorted.map((row) => {
                        const isExpanded = expandedProducts.has(row.productId);
                        const hasMultiple = row.aplicaciones.length > 1;

                        return (
                          <Fragment key={row.productId}>
                            {/* ── Aggregate row (1 per product) ── */}
                            <tr
                              className={[
                                'border-b border-slate-50 transition-colors',
                                hasMultiple
                                  ? 'cursor-pointer hover:bg-slate-50'
                                  : 'hover:bg-slate-50',
                              ].join(' ')}
                              onClick={hasMultiple ? () => toggleProduct(row.productId) : undefined}
                            >
                              {/* Expand chevron */}
                              <td className="px-2 py-2 text-center">
                                {hasMultiple && (
                                  <ChevronRight
                                    size={12}
                                    className={[
                                      'text-slate-400 transition-transform duration-150',
                                      isExpanded ? 'rotate-90' : '',
                                    ].join(' ')}
                                  />
                                )}
                              </td>

                              {/* Product name */}
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-slate-900">{row.nombre}</span>
                                  {row.aplicaciones.some((a) => a.tieneCambios) && (
                                    <History size={12} className="text-amber-500 shrink-0" />
                                  )}
                                </div>
                                {/* Show lot name inline when there's only one application */}
                                {!hasMultiple && (
                                  <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                                    {row.aplicaciones[0]?.loteLabel}
                                    {' · '}
                                    {row.aplicaciones[0]?.varianteLabel}
                                    {' · '}
                                    {row.aplicaciones[0]?.dosis.toLocaleString('es-VE', {
                                      maximumFractionDigits: 3,
                                    })}
                                    {' / ha'}
                                  </div>
                                )}
                                {hasMultiple && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    {row.aplicaciones.length} aplicaciones · click para expandir
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-2 text-slate-500">
                                {row.subcategoria ?? '—'}
                              </td>
                              <td className="px-4 py-2 text-slate-500">{row.proveedor ?? '—'}</td>
                              <td className="px-4 py-2 text-right font-mono text-slate-700">
                                {row.totalHa.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-semibold text-slate-900">
                                {row.totalCantidadFisica.toLocaleString('es-VE', {
                                  maximumFractionDigits: 3,
                                })}
                                {row.unidadComun && (
                                  <span className="ml-1 font-normal text-slate-500">
                                    {row.unidadComun}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-semibold text-green-700">
                                ${row.totalCosto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2">
                                {!hasMultiple && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditando(row.aplicaciones[0].pp);
                                    }}
                                    className="text-slate-400 hover:text-green-700 transition-colors"
                                    title="Editar"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>

                            {/* ── Detail rows (1 per lote, shown when expanded) ── */}
                            {isExpanded &&
                              row.aplicaciones.map((ap) => (
                                <tr
                                  key={ap.pp.id}
                                  className="border-b border-slate-50 bg-slate-50/70"
                                >
                                  <td className="px-2 py-1.5" />
                                  {/* Lot name + variant + dose */}
                                  <td className="px-4 py-1.5 pl-8">
                                    <div className="flex items-center gap-1 text-slate-700">
                                      {ap.loteLabel}
                                      {ap.tieneCambios && (
                                        <History size={11} className="text-amber-500 shrink-0" />
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      {ap.varianteLabel} · {ap.dosis.toLocaleString('es-VE', {
                                        maximumFractionDigits: 3,
                                      })} / ha
                                    </div>
                                  </td>
                                  {/* Subcategoría col — reused for empty spacer */}
                                  <td className="px-4 py-1.5" />
                                  {/* Proveedor col — precio por unidad */}
                                  <td className="px-4 py-1.5 text-slate-400 tabular-nums">
                                    ${ap.precioUnitario.toLocaleString('es-VE', {
                                      minimumFractionDigits: 2,
                                    })} / u.
                                  </td>
                                  {/* Ha */}
                                  <td className="px-4 py-1.5 text-right font-mono text-slate-600">
                                    {ap.ha.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                                  </td>
                                  {/* Cantidad */}
                                  <td className="px-4 py-1.5 text-right font-mono text-slate-700 font-medium">
                                    {ap.cantidadFisica.toLocaleString('es-VE', {
                                      maximumFractionDigits: 3,
                                    })}
                                    <span className="ml-1 font-normal text-slate-500">
                                      {ap.unidad}
                                    </span>
                                  </td>
                                  {/* Costo */}
                                  <td className="px-4 py-1.5 text-right font-mono text-green-700">
                                    ${ap.costo.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                  </td>
                                  {/* Edit */}
                                  <td className="px-4 py-1.5">
                                    <button
                                      onClick={() => setEditando(ap.pp)}
                                      className="text-slate-400 hover:text-green-700 transition-colors"
                                      title="Editar"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      {/* Modals */}
      {editando && (
        <EditarPlanProductoModal
          open={!!editando}
          planProducto={
            editando as Parameters<typeof EditarPlanProductoModal>[0]['planProducto']
          }
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
