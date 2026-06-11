'use client';

import { Fragment, useState, useMemo, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Plus, Pencil, History, ChevronDown, ChevronRight } from 'lucide-react';
import { calcularRedondeoAgregado } from '@/lib/rounding';
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
  precio_override?: number | null;
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

// ─── Anchos de columna compartidos (mantienen las cifras alineadas en todos los niveles) ──
const W_HA = 'w-16 sm:w-20';
const W_CANT = 'w-24 sm:w-28';
const W_COSTO = 'w-24 sm:w-28';
const W_ACT = 'w-8';

// ─── Mapeo nivel 1 (Categoría) a partir de la subcategoría guardada en BD ─────
// El campo `producto.categoria` de la BD corresponde a "Sub Categoría 2" del audit
// (Agroq, Fertilizante, etc.). El nivel superior (Insumos / Mecanización / Costo
// Financiero) se deriva aquí. Si aparece una subcategoría nueva, cae en "Otros".
const MECANIZACION = new Set([
  'Avioneta', 'Coqueo', 'Cosechadora', 'Flete de cosecha', 'Pase de asperjadora',
  'Pase de encaladora', 'Pase de rastra', 'Pase de rotativa', 'Pase de trompo (Reabono)',
  'Pase de Subsolador', 'Personal: labores, comidas, seguridad', 'Sembradora',
]);
const FINANCIERO = new Set(['Financiamiento', 'Costos de financiamiento']);

function categoriaNivel1(subcategoria: string): string {
  if (FINANCIERO.has(subcategoria)) return 'Costo Financiero';
  if (MECANIZACION.has(subcategoria)) return 'Mecanización';
  if (subcategoria === 'Otros' || subcategoria === '0' || !subcategoria) return 'Otros';
  return 'Insumos';
}

// Orden de presentación de las categorías de nivel 1
const ORDEN_NIVEL1 = ['Insumos', 'Mecanización', 'Costo Financiero', 'Otros'];

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

const fmtMoneda = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number, dec = 2) => n.toLocaleString('es-VE', { maximumFractionDigits: dec });

// ─── types ───────────────────────────────────────────────────────────────────

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
  categoria: string;            // nivel 2 (subcategoría en BD)
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

interface SubcatNode {
  subcategoria: string;
  productos: AggRow[];
  totalCosto: number;
}

interface CategoriaNode {
  nivel1: string;
  subcategorias: SubcatNode[];
  totalProductos: number;
  totalCosto: number;
}

// ─── aggregate builder (1 fila por producto, redondeo a empaque por variante) ──

function buildAggRows(items: PlanProducto[], lotes: Lote[]): AggRow[] {
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
    const categoria = first.variante?.producto?.categoria ?? 'Sin categoría';
    const proveedor = first.variante?.producto?.proveedor?.nombre ?? null;

    // Sub-agrupar por variante para aplicar UN SOLO ceil por variante
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
          cantidadFisica: raw,
          unidad: v.unidad,
          costo: frac * costoTotal,
          tieneCambios: pp.plan_cambios.length > 0,
        });
      }
    }

    const unidadComun = unidadesVistas.size === 1 ? [...unidadesVistas][0] : null;

    rows.push({
      productId, nombre, categoria, proveedor,
      totalHa, totalUnidades, totalCantidadFisica, unidadComun, totalCosto,
      aplicaciones,
    });
  }
  return rows;
}

// ─── tree builder: nivel1 (Categoría) → nivel2 (Subcategoría) → producto ──────

function buildTree(items: PlanProducto[], lotes: Lote[]): CategoriaNode[] {
  const aggRows = buildAggRows(items, lotes);

  // Agrupar por nivel1
  const porNivel1 = new Map<string, AggRow[]>();
  for (const row of aggRows) {
    const n1 = categoriaNivel1(row.categoria);
    if (!porNivel1.has(n1)) porNivel1.set(n1, []);
    porNivel1.get(n1)!.push(row);
  }

  const nodos: CategoriaNode[] = [];
  for (const [nivel1, rows] of porNivel1) {
    // Agrupar por subcategoría (nivel2)
    const porSub = new Map<string, AggRow[]>();
    for (const row of rows) {
      if (!porSub.has(row.categoria)) porSub.set(row.categoria, []);
      porSub.get(row.categoria)!.push(row);
    }

    const subcategorias: SubcatNode[] = [...porSub.entries()]
      .map(([subcategoria, productos]) => ({
        subcategoria,
        productos: productos.sort((a, b) => b.totalCosto - a.totalCosto),
        totalCosto: productos.reduce((s, p) => s + p.totalCosto, 0),
      }))
      .sort((a, b) => a.subcategoria.localeCompare(b.subcategoria, 'es'));

    nodos.push({
      nivel1,
      subcategorias,
      totalProductos: rows.length,
      totalCosto: rows.reduce((s, r) => s + r.totalCosto, 0),
    });
  }

  return nodos.sort((a, b) => {
    const ia = ORDEN_NIVEL1.indexOf(a.nivel1);
    const ib = ORDEN_NIVEL1.indexOf(b.nivel1);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

// ─── component ───────────────────────────────────────────────────────────────

export default function TabPlan({ plan, lotes, productorId }: Props) {
  const [editando, setEditando] = useState<PlanProducto | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [creandoPlan, setCreandoPlan] = useState(false);
  const [planLocal, setPlanLocal] = useState(plan);

  // Categorías (nivel 1) cerradas — vacío = todas abiertas
  const [catCerradas, setCatCerradas] = useState<Set<string>>(new Set());
  // Subcategorías (nivel 2) abiertas — vacío = todas cerradas
  const [subAbiertas, setSubAbiertas] = useState<Set<string>>(new Set());
  // Productos (nivel 3) expandidos para ver aplicaciones por lote
  const [prodExpandidos, setProdExpandidos] = useState<Set<string>>(new Set());

  const toggle = useCallback(
    (set: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
      set((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    },
    [],
  );

  const handlePlanActualizado = useCallback((nuevoPlan: typeof plan) => {
    setPlanLocal(nuevoPlan);
  }, []);

  const tree = useMemo(
    () => buildTree(planLocal?.plan_productos ?? [], lotes),
    [planLocal, lotes],
  );

  const totalCosto = useMemo(
    () => tree.reduce((sum, n) => sum + n.totalCosto, 0),
    [tree],
  );

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
            Costo total: {fmtMoneda(totalCosto)}
          </span>
        </p>
        <Button size="sm" onClick={() => setAgregando(true)}>
          <Plus size={14} />
          Agregar producto
        </Button>
      </div>

      {/* ── Nivel 1: Categoría ── */}
      {tree.map((cat) => {
        const catCerrada = catCerradas.has(cat.nivel1);
        return (
          <Card key={cat.nivel1}>
            <button
              onClick={() => toggle(setCatCerradas, cat.nivel1)}
              className="w-full px-4 py-3 flex items-center gap-2 bg-slate-100 hover:bg-slate-200/70 transition-colors rounded-t-xl"
            >
              <ChevronDown
                size={16}
                className={['text-slate-500 transition-transform duration-200', catCerrada ? '-rotate-90' : ''].join(' ')}
              />
              <h3 className="text-sm font-bold text-slate-800 flex-1 text-left">{cat.nivel1}</h3>
              <span className="text-xs text-slate-400">
                {cat.totalProductos} {cat.totalProductos === 1 ? 'producto' : 'productos'}
              </span>
              <span className={`${W_COSTO} text-right text-sm font-mono font-semibold text-slate-800`}>
                {fmtMoneda(cat.totalCosto)}
              </span>
            </button>

            <div
              className="grid transition-[grid-template-rows] duration-200 ease-out"
              style={{ gridTemplateRows: catCerrada ? '0fr' : '1fr' }}
            >
              <div className="overflow-hidden">
                {/* ── Nivel 2: Subcategoría ── */}
                {cat.subcategorias.map((sub) => {
                  const subKey = `${cat.nivel1}>${sub.subcategoria}`;
                  const subAbierta = subAbiertas.has(subKey);
                  return (
                    <div key={subKey} className="border-t border-slate-100">
                      <button
                        onClick={() => toggle(setSubAbiertas, subKey)}
                        className="w-full pr-4 py-2.5 pl-8 flex items-center gap-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                      >
                        <ChevronRight
                          size={14}
                          className={['text-slate-400 transition-transform duration-200', subAbierta ? 'rotate-90' : ''].join(' ')}
                        />
                        <span className="text-xs font-semibold text-slate-600 flex-1 text-left">
                          {sub.subcategoria}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {sub.productos.length} {sub.productos.length === 1 ? 'producto' : 'productos'}
                        </span>
                        <span className={`${W_COSTO} text-right text-xs font-mono font-medium text-slate-600`}>
                          {fmtMoneda(sub.totalCosto)}
                        </span>
                      </button>

                      <div
                        className="grid transition-[grid-template-rows] duration-200 ease-out"
                        style={{ gridTemplateRows: subAbierta ? '1fr' : '0fr' }}
                      >
                        <div className="overflow-hidden">
                          {/* Headers de producto (aparecen al abrir la subcategoría) */}
                          <div className="flex items-center gap-2 pr-4 pl-12 py-1.5 bg-white border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            <span className="flex-1">Producto</span>
                            <span className={`${W_HA} text-right`}>Ha</span>
                            <span className={`${W_CANT} text-right`}>Cantidad</span>
                            <span className={`${W_COSTO} text-right`}>Costo</span>
                            <span className={W_ACT} />
                          </div>

                          {/* ── Nivel 3: Producto ── */}
                          {sub.productos.map((row) => {
                            const isExpanded = prodExpandidos.has(row.productId);
                            const hasMultiple = row.aplicaciones.length > 1;
                            const tieneCambios = row.aplicaciones.some((a) => a.tieneCambios);

                            return (
                              <Fragment key={row.productId}>
                                <div
                                  className={[
                                    'flex items-center gap-2 pr-4 pl-12 py-2 border-b border-slate-50 transition-colors',
                                    hasMultiple ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50',
                                  ].join(' ')}
                                  onClick={hasMultiple ? () => toggle(setProdExpandidos, row.productId) : undefined}
                                >
                                  <div className="flex-1 min-w-0 flex items-start gap-1.5">
                                    {hasMultiple ? (
                                      <ChevronRight
                                        size={12}
                                        className={['text-slate-400 mt-0.5 shrink-0 transition-transform duration-150', isExpanded ? 'rotate-90' : ''].join(' ')}
                                      />
                                    ) : (
                                      <span className="w-3 shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium text-slate-900 truncate uppercase">{row.nombre}</span>
                                        {tieneCambios && <History size={11} className="text-amber-500 shrink-0" />}
                                      </div>
                                      {!hasMultiple && row.aplicaciones[0] && (
                                        <div className="text-[10px] text-slate-400 mt-0.5 leading-tight truncate">
                                          {row.aplicaciones[0].loteLabel} · {row.aplicaciones[0].varianteLabel} ·{' '}
                                          {fmtNum(row.aplicaciones[0].dosis, 3)} / ha
                                        </div>
                                      )}
                                      {hasMultiple && (
                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                          {row.aplicaciones.length} aplicaciones
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <span className={`${W_HA} text-right font-mono text-xs text-slate-600`}>
                                    {fmtNum(row.totalHa)}
                                  </span>
                                  <span className={`${W_CANT} text-right font-mono text-xs font-semibold text-slate-900`}>
                                    {fmtNum(row.totalCantidadFisica, 3)}
                                    {row.unidadComun && <span className="ml-1 font-normal text-slate-400">{row.unidadComun}</span>}
                                  </span>
                                  <span className={`${W_COSTO} text-right font-mono text-xs font-semibold text-green-700`}>
                                    {fmtMoneda(row.totalCosto)}
                                  </span>
                                  <span className={`${W_ACT} flex justify-end`}>
                                    {!hasMultiple && row.aplicaciones[0] && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setEditando(row.aplicaciones[0].pp); }}
                                        className="text-slate-400 hover:text-green-700 transition-colors"
                                        title="Editar"
                                      >
                                        <Pencil size={13} />
                                      </button>
                                    )}
                                  </span>
                                </div>

                                {/* ── Nivel 4: Aplicación en lote ── */}
                                {hasMultiple && isExpanded && (
                                  <>
                                    {/* Headers de lote (aparecen al abrir el producto) */}
                                    <div className="flex items-center gap-2 pr-4 pl-[4.5rem] py-1 bg-slate-50/80 border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                      <span className="flex-1">Lote · variante</span>
                                      <span className={`${W_HA} text-right`}>Ha</span>
                                      <span className={`${W_CANT} text-right`}>Cantidad</span>
                                      <span className={`${W_COSTO} text-right`}>Costo</span>
                                      <span className={W_ACT} />
                                    </div>
                                    {row.aplicaciones.map((ap) => (
                                      <div
                                        key={ap.pp.id}
                                        className="flex items-center gap-2 pr-4 pl-[4.5rem] py-1.5 border-b border-slate-50 bg-slate-50/40 hover:bg-slate-100/60 transition-colors"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1 text-xs text-slate-700">
                                            <span className="truncate">{ap.loteLabel}</span>
                                            {ap.tieneCambios && <History size={10} className="text-amber-500 shrink-0" />}
                                          </div>
                                          <div className="text-[10px] text-slate-400 mt-0.5">
                                            {ap.varianteLabel} · {fmtNum(ap.dosis, 3)} / ha · {fmtMoneda(ap.precioUnitario)} u.
                                          </div>
                                        </div>
                                        <span className={`${W_HA} text-right font-mono text-xs text-slate-500`}>
                                          {fmtNum(ap.ha)}
                                        </span>
                                        <span className={`${W_CANT} text-right font-mono text-xs text-slate-700`}>
                                          {fmtNum(ap.cantidadFisica, 3)}
                                          <span className="ml-1 font-normal text-slate-400">{ap.unidad}</span>
                                        </span>
                                        <span className={`${W_COSTO} text-right font-mono text-xs text-green-700`}>
                                          {fmtMoneda(ap.costo)}
                                        </span>
                                        <span className={`${W_ACT} flex justify-end`}>
                                          <button
                                            onClick={() => setEditando(ap.pp)}
                                            className="text-slate-400 hover:text-green-700 transition-colors"
                                            title="Editar"
                                          >
                                            <Pencil size={12} />
                                          </button>
                                        </span>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </Fragment>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
