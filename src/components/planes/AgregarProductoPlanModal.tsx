'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { calcularRedondeo } from '@/lib/rounding';
import SearchInput from '@/components/ui/SearchInput';

interface Lote {
  id: string;
  nombre: string;
  hectareas: number;
}

interface Props {
  open: boolean;
  planId: string;
  lotes: Lote[];
  productorId: string;
  onClose: () => void;
  onAgregado: (plan: { id: string; ciclo: number; plan_productos: unknown[] }) => void;
}

interface ProductoBuscado {
  id: string;
  nombre: string;
  categoria: string;
  subcategoria: string | null;
  proveedor: { nombre: string } | null;
  variantes: { id: string; unidad: string; presentacion: number; precio: number }[];
}

export default function AgregarProductoPlanModal({
  open,
  planId,
  lotes,
  productorId,
  onClose,
  onAgregado,
}: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [productos, setProductos] = useState<ProductoBuscado[]>([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoBuscado | null>(null);
  const [varianteId, setVarianteId] = useState('');
  const [dosisHa, setDosisHa] = useState('');
  const [aplicarATodos, setAplicarATodos] = useState(true);
  const [lotesSeleccionados, setLotesSeleccionados] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!open) return;
    setBuscando(true);
    supabase
      .from('productos')
      .select(`
        id, nombre, categoria, subcategoria,
        proveedor:proveedores(nombre),
        variantes:variantes_producto(id, unidad, presentacion, precio)
      `)
      .order('nombre')
      .then(({ data, error: fetchError }) => {
        if (fetchError) setError(fetchError.message);
        setProductos((data ?? []) as unknown as ProductoBuscado[]);
        setBuscando(false);
      });
  }, [open, supabase]);

  const productosFiltrados = useMemo(() => {
    if (!busqueda) return productos.slice(0, 20);
    const q = busqueda.toLowerCase();
    return productos
      .filter((p) => p.nombre.toLowerCase().includes(q) || p.proveedor?.nombre.toLowerCase().includes(q))
      .slice(0, 20);
  }, [productos, busqueda]);

  const varianteActual = productoSeleccionado?.variantes.find((v) => v.id === varianteId);
  const haAplicables = useMemo(() => {
    const aplicables = aplicarATodos
      ? lotes
      : lotes.filter((l) => lotesSeleccionados.includes(l.id));
    return aplicables.reduce((s, l) => s + l.hectareas, 0);
  }, [aplicarATodos, lotesSeleccionados, lotes]);

  const preview = useMemo(() => {
    if (!varianteActual || !dosisHa) return null;
    return calcularRedondeo({
      dosisHa: Number(dosisHa),
      hectareas: haAplicables,
      presentacion: varianteActual.presentacion,
      precio: varianteActual.precio,
    });
  }, [varianteActual, dosisHa, haAplicables]);

  const toggleLote = useCallback((loteId: string) => {
    setLotesSeleccionados((prev) =>
      prev.includes(loteId) ? prev.filter((id) => id !== loteId) : [...prev, loteId]
    );
  }, []);

  const handleAgregar = async () => {
    if (!varianteId || !dosisHa || !productoSeleccionado) return;
    setLoading(true);
    setError('');

    try {
      const { error: insertError } = await supabase.from('plan_productos').insert({
        plan_id: planId,
        variante_id: varianteId,
        dosis_ha: Number(dosisHa),
        lotes_ids: aplicarATodos ? null : lotesSeleccionados,
      });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      const { data: planActualizado } = await supabase
        .from('planes')
        .select(`
          id, ciclo,
          plan_productos(
            id, dosis_ha, lotes_ids, precio_override, created_at,
            variante:variantes_producto(
              id, unidad, presentacion, precio,
              producto:productos(id, nombre, categoria, subcategoria,
                proveedor:proveedores(id, nombre)
              )
            ),
            plan_cambios(
              id, tipo, dosis_original, dosis_nueva, motivo, fecha,
              variante_original:variantes_producto!plan_cambios_variante_original_id_fkey(
                id, unidad, presentacion, precio, producto:productos(id, nombre)
              ),
              variante_nueva:variantes_producto!plan_cambios_variante_nueva_id_fkey(
                id, unidad, presentacion, precio, producto:productos(id, nombre)
              )
            )
          )
        `)
        .eq('id', planId)
        .single();

      if (planActualizado) {
        onAgregado(planActualizado as Parameters<typeof onAgregado>[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Agregar producto al plan" size="xl">
      <div className="space-y-4">
        {!productoSeleccionado ? (
          <div>
            <SearchInput
              wrapperClassName="mb-3"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o proveedor..."
              autoFocus
            />
            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {buscando && (
                <p className="px-4 py-3 text-sm text-slate-400">Cargando productos...</p>
              )}
              {!buscando && productosFiltrados.length === 0 && (
                <p className="px-4 py-3 text-sm text-slate-400">Sin resultados</p>
              )}
              {productosFiltrados.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProductoSeleccionado(p);
                    if (p.variantes.length === 1) setVarianteId(p.variantes[0].id);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-green-50 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-900">{p.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {p.proveedor?.nombre} · {p.categoria}
                    {p.subcategoria && ` · ${p.subcategoria}`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div className="bg-slate-50 rounded-lg p-3 flex-1">
                <p className="font-semibold text-slate-900">{productoSeleccionado.nombre}</p>
                <p className="text-xs text-slate-500">
                  {productoSeleccionado.proveedor?.nombre} · {productoSeleccionado.categoria}
                </p>
              </div>
              <button
                onClick={() => {
                  setProductoSeleccionado(null);
                  setVarianteId('');
                  setDosisHa('');
                }}
                className="ml-2 text-xs text-slate-500 hover:text-slate-700 mt-3"
              >
                Cambiar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Presentación"
                value={varianteId}
                onChange={(e) => setVarianteId(e.target.value)}
                placeholder="Seleccionar presentación"
                options={productoSeleccionado.variantes.map((v) => ({
                  value: v.id,
                  label: `${v.presentacion} ${v.unidad} — $${v.precio}`,
                }))}
              />
              <Input
                label="Dosis por Ha"
                type="number"
                step="0.001"
                min="0"
                value={dosisHa}
                onChange={(e) => setDosisHa(e.target.value)}
                placeholder="0.000"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">¿A qué lotes aplica?</p>
              <div className="flex gap-3 mb-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={aplicarATodos}
                    onChange={() => setAplicarATodos(true)}
                    className="accent-green-600"
                  />
                  Todos los lotes
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={!aplicarATodos}
                    onChange={() => setAplicarATodos(false)}
                    className="accent-green-600"
                  />
                  Solo algunos lotes
                </label>
              </div>
              {!aplicarATodos && (
                <div className="flex flex-wrap gap-2">
                  {lotes.map((lote) => (
                    <label
                      key={lote.id}
                      className={[
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors',
                        lotesSeleccionados.includes(lote.id)
                          ? 'bg-green-50 border-green-400 text-green-800'
                          : 'bg-white border-slate-300 text-slate-700',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={lotesSeleccionados.includes(lote.id)}
                        onChange={() => toggleLote(lote.id)}
                        className="accent-green-600"
                      />
                      {lote.nombre} ({lote.hectareas} Ha)
                    </label>
                  ))}
                </div>
              )}
            </div>

            {preview && (
              <div className="bg-green-50 rounded-lg p-3 text-xs border border-green-200">
                <p className="font-semibold text-green-800 mb-1">Vista previa</p>
                <div className="grid grid-cols-3 gap-2 text-green-700">
                  <div>
                    <p className="text-green-600">Total s/redondear</p>
                    <p className="font-mono">{preview.totalSinRedondear.toFixed(3)}</p>
                  </div>
                  <div>
                    <p className="text-green-600">Unidades a comprar</p>
                    <p className="font-mono font-bold text-sm">{preview.unidadesNecesarias}</p>
                  </div>
                  <div>
                    <p className="text-green-600">Costo total</p>
                    <p className="font-mono font-bold text-sm">
                      ${preview.costoTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {productoSeleccionado && (
            <Button
              onClick={handleAgregar}
              loading={loading}
              disabled={!varianteId || !dosisHa || (!aplicarATodos && lotesSeleccionados.length === 0)}
            >
              Agregar al plan
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
