'use client';

import { Fragment, useState, useCallback, useMemo } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  Check, ChevronRight, AlertTriangle, CheckCircle2,
  ArrowLeftRight, Users, RefreshCw,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { calcularRedondeo } from '@/lib/rounding';
import { aplicarCambioMasivo, type TipoCambio } from '@/lib/actions/cambiosMasivos';

// ─── types ───────────────────────────────────────────────────────────────────

interface VarianteItem {
  id: string;
  presentacion: number;
  unidad: string;
  precio: number;
}

interface ProductoConVariantes {
  id: string;
  nombre: string;
  categoria: string;
  subcategoria: string | null;
  variantes: VarianteItem[];
}

interface Lote {
  id: string;
  productor_id: string;
  hectareas: number;
}

interface Props {
  productos: ProductoConVariantes[];
  productores: { id: string; nombre: string }[];
  lotes: Lote[];
}

// Represents one plan_producto that will be affected
interface AplicacionAfectada {
  id: string;
  dosisHa: number;
  lotesIds: string[] | null;
  productorId: string;
  productorNombre: string;
  varianteActual: VarianteItem & { productoNombre: string };
}

interface ImpactoProductor {
  productorId: string;
  productorNombre: string;
  items: number;
  costoActual: number;
  costoNuevo: number;
}

const TIPO_LABELS: Record<TipoCambio, string> = {
  sustitucion_producto: 'Sustitución de producto',
  cambio_variante: 'Cambio de presentación',
  cambio_precio: 'Actualización de precio',
  cambio_dosis: 'Cambio de dosis',
};

const TIPO_DESC: Record<TipoCambio, string> = {
  sustitucion_producto: 'Reemplazá un producto por otro diferente en todos los planes seleccionados.',
  cambio_variante: 'Cambiá la presentación (tamaño de envase) dentro del mismo producto.',
  cambio_precio: 'Actualizá el precio de una variante — afecta el costo de todos los planes que la usan.',
  cambio_dosis: 'Ajustá la dosis por hectárea en los planes seleccionados.',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function getHa(af: AplicacionAfectada, lotes: Lote[]): number {
  const productorLotes = lotes.filter((l) => l.productor_id === af.productorId);
  const aplicables = af.lotesIds
    ? productorLotes.filter((l) => af.lotesIds!.includes(l.id))
    : productorLotes;
  return aplicables.reduce((s, l) => s + l.hectareas, 0);
}

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDelta(n: number) {
  return (n >= 0 ? '+' : '−') + '$' + fmt(Math.abs(n));
}

// ─── step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ paso }: { paso: number }) {
  const steps = [
    { n: 1, label: 'Definir cambio' },
    { n: 2, label: 'Alcance' },
    { n: 3, label: 'Confirmar' },
  ];
  return (
    <div className="flex items-center mb-6">
      {steps.map((s, i) => (
        <Fragment key={s.n}>
          <div className="flex items-center gap-2 shrink-0">
            <div
              className={[
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                paso > s.n
                  ? 'bg-green-700 text-white'
                  : paso === s.n
                  ? 'bg-green-100 text-green-700 ring-2 ring-green-700'
                  : 'bg-slate-100 text-slate-400',
              ].join(' ')}
            >
              {paso > s.n ? <Check size={13} /> : s.n}
            </div>
            <span
              className={[
                'text-sm font-medium hidden sm:block',
                paso >= s.n ? 'text-slate-700' : 'text-slate-400',
              ].join(' ')}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-px bg-slate-200 mx-3" />
          )}
        </Fragment>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function CambioMasivoWizard({ productos, lotes }: Props) {
  // ── paso 1 state ──
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [tipo, setTipo] = useState<TipoCambio>('cambio_precio');
  const [productoOrigenId, setProductoOrigenId] = useState('');
  const [varianteOrigenId, setVarianteOrigenId] = useState('');
  const [productoDestinoId, setProductoDestinoId] = useState('');
  const [varianteDestinoId, setVarianteDestinoId] = useState('');
  const [nuevaDosis, setNuevaDosis] = useState('');
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [descripcion, setDescripcion] = useState('');

  // ── paso 2 state ──
  const [afectadas, setAfectadas] = useState<AplicacionAfectada[]>([]);
  const [loadingAfectadas, setLoadingAfectadas] = useState(false);
  const [alcance, setAlcance] = useState<'todos' | 'seleccion'>('todos');
  const [productoresSeleccionados, setProductoresSeleccionados] = useState<Set<string>>(new Set());

  // ── paso 3 state ──
  const [motivo, setMotivo] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; afectados?: number; error?: string } | null>(null);

  // ── derived ──
  const productoOrigen = productos.find((p) => p.id === productoOrigenId);
  const variantesOrigen = productoOrigen?.variantes ?? [];
  const varianteOrigen = variantesOrigen.find((v) => v.id === varianteOrigenId);

  const productoDestino = productos.find((p) => p.id === productoDestinoId);
  const variantesDestino =
    tipo === 'cambio_variante'
      ? variantesOrigen.filter((v) => v.id !== varianteOrigenId)
      : productoDestino?.variantes ?? [];
  const varianteDestino = variantesDestino.find((v) => v.id === varianteDestinoId);

  // Producers that have affected items
  const productoresConAfectadas = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; items: number }>();
    for (const af of afectadas) {
      if (!map.has(af.productorId)) {
        map.set(af.productorId, { id: af.productorId, nombre: af.productorNombre, items: 0 });
      }
      map.get(af.productorId)!.items++;
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [afectadas]);

  // Items filtered by scope
  const afectadasEnScope = useMemo(() => {
    if (alcance === 'todos') return afectadas;
    return afectadas.filter((af) => productoresSeleccionados.has(af.productorId));
  }, [afectadas, alcance, productoresSeleccionados]);

  // Impact preview
  const impacto = useMemo((): ImpactoProductor[] => {
    const map = new Map<string, ImpactoProductor>();
    for (const af of afectadasEnScope) {
      const ha = getHa(af, lotes);
      const { costoTotal: costoAct } = calcularRedondeo({
        dosisHa: af.dosisHa,
        hectareas: ha,
        presentacion: af.varianteActual.presentacion,
        precio: af.varianteActual.precio,
      });

      const precioNuevo =
        tipo === 'cambio_precio' ? Number(nuevoPrecio) || af.varianteActual.precio
        : varianteDestino?.precio ?? af.varianteActual.precio;
      const presentacionNueva =
        (tipo === 'sustitucion_producto' || tipo === 'cambio_variante')
          ? (varianteDestino?.presentacion ?? af.varianteActual.presentacion)
          : af.varianteActual.presentacion;
      const dosisNueva =
        tipo === 'cambio_dosis' ? Number(nuevaDosis) || af.dosisHa : af.dosisHa;

      const { costoTotal: costoNew } = calcularRedondeo({
        dosisHa: dosisNueva,
        hectareas: ha,
        presentacion: presentacionNueva,
        precio: precioNuevo,
      });

      if (!map.has(af.productorId)) {
        map.set(af.productorId, {
          productorId: af.productorId,
          productorNombre: af.productorNombre,
          items: 0,
          costoActual: 0,
          costoNuevo: 0,
        });
      }
      const row = map.get(af.productorId)!;
      row.items++;
      row.costoActual += costoAct;
      row.costoNuevo += costoNew;
    }
    return [...map.values()].sort((a, b) => a.productorNombre.localeCompare(b.productorNombre, 'es'));
  }, [afectadasEnScope, lotes, tipo, nuevoPrecio, nuevaDosis, varianteDestino]);

  const totalActual = impacto.reduce((s, r) => s + r.costoActual, 0);
  const totalNuevo = impacto.reduce((s, r) => s + r.costoNuevo, 0);
  const totalDelta = totalNuevo - totalActual;

  // ── step 1 validation ──
  const paso1Valido = useMemo(() => {
    if (!varianteOrigenId || !descripcion.trim()) return false;
    if (tipo === 'sustitucion_producto' && !varianteDestinoId) return false;
    if (tipo === 'cambio_variante' && !varianteDestinoId) return false;
    if (tipo === 'cambio_dosis' && !nuevaDosis) return false;
    if (tipo === 'cambio_precio' && !nuevoPrecio) return false;
    return true;
  }, [tipo, varianteOrigenId, varianteDestinoId, nuevaDosis, nuevoPrecio, descripcion]);

  // ── handlers ──
  const irAPaso2 = useCallback(async () => {
    if (!varianteOrigenId) return;
    setPaso(2);
    setLoadingAfectadas(true);
    setAfectadas([]);
    setAlcance('todos');
    setProductoresSeleccionados(new Set());

    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from('plan_productos')
        .select(`
          id, dosis_ha, lotes_ids, precio_override,
          plan:planes!inner(
            productor_id,
            productor:productores!inner(id, nombre)
          )
        `)
        .eq('variante_id', varianteOrigenId);

      const items: AplicacionAfectada[] = (data ?? []).map((row) => {
        const plan = (row.plan as unknown) as { productor_id: string; productor: { id: string; nombre: string } };
        return {
          id: row.id,
          dosisHa: row.dosis_ha,
          lotesIds: row.lotes_ids,
          productorId: plan.productor_id,
          productorNombre: plan.productor.nombre,
          varianteActual: {
            ...(varianteOrigen ?? { id: varianteOrigenId, presentacion: 0, unidad: '', precio: 0 }),
            productoNombre: productoOrigen?.nombre ?? '',
          },
        };
      });

      setAfectadas(items);
    } finally {
      setLoadingAfectadas(false);
    }
  }, [varianteOrigenId, varianteOrigen, productoOrigen]);

  const toggleProductor = useCallback((id: string) => {
    setProductoresSeleccionados((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleAplicar = async () => {
    setAplicando(true);
    const preciosOriginales: Record<string, number> = {};
    for (const af of afectadasEnScope) {
      preciosOriginales[af.id] = af.varianteActual.precio;
    }

    const result = await aplicarCambioMasivo({
      tipo,
      descripcion,
      motivo,
      varianteOrigenId,
      varianteDestinoId: varianteDestinoId || undefined,
      nuevaDosis: nuevaDosis ? Number(nuevaDosis) : undefined,
      nuevoPrecio: nuevoPrecio ? Number(nuevoPrecio) : undefined,
      planProductoIds: afectadasEnScope.map((af) => af.id),
      preciosOriginales,
    });

    setResultado({ ok: result.ok, afectados: result.afectados, error: result.error });
    setAplicando(false);
  };

  const resetWizard = () => {
    setPaso(1);
    setTipo('cambio_precio');
    setProductoOrigenId('');
    setVarianteOrigenId('');
    setProductoDestinoId('');
    setVarianteDestinoId('');
    setNuevaDosis('');
    setNuevoPrecio('');
    setDescripcion('');
    setAfectadas([]);
    setAlcance('todos');
    setProductoresSeleccionados(new Set());
    setMotivo('');
    setResultado(null);
  };

  // ─── resultado final ───────────────────────────────────────────────────────
  if (resultado) {
    return (
      <Card>
        <div className="p-8 text-center max-w-md mx-auto">
          {resultado.ok ? (
            <>
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} className="text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Cambio aplicado
              </h2>
              <p className="text-slate-500 text-sm mb-6">
                {resultado.afectados} ítem{resultado.afectados !== 1 ? 's' : ''} actualizados correctamente.
              </p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={28} className="text-rose-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Error al aplicar</h2>
              <p className="text-rose-600 text-sm mb-6">{resultado.error}</p>
            </>
          )}
          <Button onClick={resetWizard}>
            <RefreshCw size={15} />
            Nuevo cambio
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-6">
        <StepIndicator paso={paso} />

        {/* ══════════════════════════════════════════════════════════════
            PASO 1 — Definir el cambio
        ══════════════════════════════════════════════════════════════ */}
        {paso === 1 && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">Tipo de cambio</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(Object.keys(TIPO_LABELS) as TipoCambio[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTipo(t);
                      setVarianteDestinoId('');
                      setProductoDestinoId('');
                    }}
                    className={[
                      'text-left rounded-lg border px-4 py-3 transition-colors',
                      tipo === t
                        ? 'border-green-600 bg-green-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white',
                    ].join(' ')}
                  >
                    <p className={['text-sm font-medium', tipo === t ? 'text-green-800' : 'text-slate-700'].join(' ')}>
                      {TIPO_LABELS[t]}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{TIPO_DESC[t]}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Producto + variante origen */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Producto {tipo === 'cambio_variante' ? '' : 'actual'} *
                </label>
                <select
                  value={productoOrigenId}
                  onChange={(e) => {
                    setProductoOrigenId(e.target.value);
                    setVarianteOrigenId('');
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                  <option value="">Seleccioná un producto…</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Variante actual *
                </label>
                <select
                  value={varianteOrigenId}
                  onChange={(e) => setVarianteOrigenId(e.target.value)}
                  disabled={!productoOrigenId}
                  className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 disabled:opacity-50"
                >
                  <option value="">Seleccioná una variante…</option>
                  {variantesOrigen.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.presentacion} {v.unidad} — ${v.precio.toLocaleString('es-VE')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fields dependientes del tipo */}
            {(tipo === 'sustitucion_producto') && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Producto de reemplazo *
                  </label>
                  <select
                    value={productoDestinoId}
                    onChange={(e) => {
                      setProductoDestinoId(e.target.value);
                      setVarianteDestinoId('');
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  >
                    <option value="">Seleccioná…</option>
                    {productos
                      .filter((p) => p.id !== productoOrigenId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Variante de reemplazo *
                  </label>
                  <select
                    value={varianteDestinoId}
                    onChange={(e) => setVarianteDestinoId(e.target.value)}
                    disabled={!productoDestinoId}
                    className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 disabled:opacity-50"
                  >
                    <option value="">Seleccioná…</option>
                    {variantesDestino.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.presentacion} {v.unidad} — ${v.precio.toLocaleString('es-VE')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {tipo === 'cambio_variante' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nueva presentación (mismo producto) *
                </label>
                <select
                  value={varianteDestinoId}
                  onChange={(e) => setVarianteDestinoId(e.target.value)}
                  disabled={variantesDestino.length === 0}
                  className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 disabled:opacity-50"
                >
                  <option value="">Seleccioná nueva presentación…</option>
                  {variantesDestino.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.presentacion} {v.unidad} — ${v.precio.toLocaleString('es-VE')}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {tipo === 'cambio_precio' && (
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Nuevo precio por unidad *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={nuevoPrecio}
                      onChange={(e) => setNuevoPrecio(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                    />
                  </div>
                </div>
                {varianteOrigen && nuevoPrecio && (
                  <div className="shrink-0 rounded-lg bg-slate-50 px-4 py-2 text-xs text-slate-600 border border-slate-200">
                    <span className="line-through text-slate-400 mr-2">
                      ${varianteOrigen.precio.toLocaleString('es-VE')}
                    </span>
                    <span className={Number(nuevoPrecio) > varianteOrigen.precio ? 'text-rose-600 font-semibold' : 'text-green-700 font-semibold'}>
                      ${Number(nuevoPrecio).toLocaleString('es-VE')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {tipo === 'cambio_dosis' && (
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Nueva dosis por ha *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={nuevaDosis}
                    onChange={(e) => setNuevaDosis(e.target.value)}
                    placeholder="0.000"
                    className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
              </div>
            )}

            {/* Descripción */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Descripción del cambio *
              </label>
              <input
                type="text"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Xpandrop → ClorGreen por desabastecimiento"
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-300"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={irAPaso2} disabled={!paso1Valido}>
                Ver productores afectados
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            PASO 2 — Alcance
        ══════════════════════════════════════════════════════════════ */}
        {paso === 2 && (
          <div className="space-y-5 max-w-2xl">
            {loadingAfectadas ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                Buscando planes afectados…
              </div>
            ) : afectadas.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-slate-500 text-sm">
                  Ningún plan usa esta variante actualmente.
                </p>
                <button
                  className="text-xs text-green-700 mt-3 hover:underline"
                  onClick={() => setPaso(1)}
                >
                  ← Volver
                </button>
              </div>
            ) : (
              <>
                {/* Scope selector */}
                <div className="grid grid-cols-2 gap-3">
                  {(['todos', 'seleccion'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setAlcance(opt)}
                      className={[
                        'flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                        alcance === opt
                          ? 'border-green-600 bg-green-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white',
                      ].join(' ')}
                    >
                      <div className={[
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        alcance === opt ? 'bg-green-100' : 'bg-slate-100',
                      ].join(' ')}>
                        {opt === 'todos'
                          ? <ArrowLeftRight size={15} className={alcance === opt ? 'text-green-700' : 'text-slate-400'} />
                          : <Users size={15} className={alcance === opt ? 'text-green-700' : 'text-slate-400'} />}
                      </div>
                      <div>
                        <p className={['text-sm font-medium', alcance === opt ? 'text-green-800' : 'text-slate-700'].join(' ')}>
                          {opt === 'todos' ? 'Todos los productores' : 'Seleccionar productores'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {opt === 'todos'
                            ? `${productoresConAfectadas.length} productores · ${afectadas.length} ítems`
                            : `${productoresSeleccionados.size} seleccionados`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Producer checklist (only when 'seleccion') */}
                {alcance === 'seleccion' && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 flex items-center justify-between border-b border-slate-200">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        Productor
                      </p>
                      <button
                        className="text-xs text-green-700 hover:underline"
                        onClick={() => {
                          if (productoresSeleccionados.size === productoresConAfectadas.length) {
                            setProductoresSeleccionados(new Set());
                          } else {
                            setProductoresSeleccionados(new Set(productoresConAfectadas.map((p) => p.id)));
                          }
                        }}
                      >
                        {productoresSeleccionados.size === productoresConAfectadas.length
                          ? 'Deseleccionar todos'
                          : 'Seleccionar todos'}
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                      {productoresConAfectadas.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={productoresSeleccionados.has(p.id)}
                            onChange={() => toggleProductor(p.id)}
                            className="accent-green-700 w-4 h-4"
                          />
                          <span className="flex-1 text-sm text-slate-800">{p.nombre}</span>
                          <span className="text-xs text-slate-400">{p.items} ítems</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="secondary" onClick={() => setPaso(1)}>
                    ← Volver
                  </Button>
                  <Button
                    onClick={() => setPaso(3)}
                    disabled={alcance === 'seleccion' && productoresSeleccionados.size === 0}
                  >
                    Ver impacto
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            PASO 3 — Vista previa y confirmar
        ══════════════════════════════════════════════════════════════ */}
        {paso === 3 && (
          <div className="space-y-5">
            {/* Summary chips */}
            <div className="flex flex-wrap gap-3">
              <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                {TIPO_LABELS[tipo]}
              </div>
              <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                {afectadasEnScope.length} ítems · {impacto.length} productores
              </div>
              <div className={[
                'rounded-lg px-3 py-1.5 text-xs font-semibold',
                totalDelta > 0 ? 'bg-rose-100 text-rose-700' : 'bg-green-100 text-green-700',
              ].join(' ')}>
                Δ {fmtDelta(totalDelta)}
              </div>
            </div>

            {/* Impact table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Productor</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-500">Ítems</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-500">Costo actual</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-500">Costo nuevo</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-500">Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {impacto.map((row) => {
                    const delta = row.costoNuevo - row.costoActual;
                    return (
                      <tr key={row.productorId} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-800">{row.productorNombre}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{row.items}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">
                          ${fmt(row.costoActual)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">
                          ${fmt(row.costoNuevo)}
                        </td>
                        <td className={[
                          'px-4 py-2 text-right font-mono font-semibold',
                          delta > 0 ? 'text-rose-600' : delta < 0 ? 'text-green-700' : 'text-slate-400',
                        ].join(' ')}>
                          {fmtDelta(delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="px-4 py-2.5 text-slate-700">Total</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{afectadasEnScope.length}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">${fmt(totalActual)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">${fmt(totalNuevo)}</td>
                    <td className={[
                      'px-4 py-2.5 text-right font-mono',
                      totalDelta > 0 ? 'text-rose-600' : totalDelta < 0 ? 'text-green-700' : 'text-slate-400',
                    ].join(' ')}>
                      {fmtDelta(totalDelta)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Motivo */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Motivo del cambio (opcional)
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Ej: Proveedor aumentó precio por inflación de insumos…"
                className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
              />
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <p>
                Esta acción actualizará <strong>{afectadasEnScope.length} ítems</strong> en{' '}
                <strong>{impacto.length} planes</strong>. Quedará registrado en el historial de cambios de cada productor.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="secondary" onClick={() => setPaso(2)}>
                ← Volver
              </Button>
              <Button
                onClick={handleAplicar}
                loading={aplicando}
                className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
              >
                Aplicar cambio masivo
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
