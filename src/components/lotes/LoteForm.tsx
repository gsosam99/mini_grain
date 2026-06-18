'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';
import { Plus, Trash2 } from 'lucide-react';
import { ESTADOS_VE } from '@/types';

const DOSIS_SEMILLA_DEFAULT = 1.3;

export interface SeedVariante {
  varianteId: string;
  productoNombre: string;
  presentacion: number;
  unidad: string;
}

export interface SeedLine {
  /** id del plan_producto existente; vacío = línea nueva */
  id: string;
  varianteId: string;
  hectareas: string; // string para el input; '' = sin valor
  dosisHa: number;
}

interface Props {
  productorId: string;
  /** plan ciclo activo del productor — requerido para gestionar semillas */
  planId?: string;
  initialData?: {
    id: string;
    nombre: string;
    hectareas: number;
    estado: string | null;
  };
  /** Catálogo de variantes de semilla (para el selector) */
  seedCatalog?: SeedVariante[];
  /** Líneas de semilla actuales del lote */
  seedLinesIniciales?: SeedLine[];
}

export default function LoteForm({
  productorId,
  planId,
  initialData,
  seedCatalog = [],
  seedLinesIniciales = [],
}: Props) {
  const router = useRouter();
  const isEdit = !!initialData;
  const puedeGestionarSemillas = isEdit && !!planId && seedCatalog.length > 0;

  const [form, setForm] = useState({
    nombre: initialData?.nombre ?? '',
    hectareas: String(initialData?.hectareas ?? ''),
    estado: initialData?.estado ?? '',
  });
  const [seedLines, setSeedLines] = useState<SeedLine[]>(seedLinesIniciales);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // ── Semillas ────────────────────────────────────────────────────────────
  const sumaHaSemillas = seedLines.reduce((s, l) => s + (Number(l.hectareas) || 0), 0);
  const haLote = Number(form.hectareas) || 0;
  const requiereCuadre = seedLines.length >= 2; // varias variedades → deben sumar el total
  const mismatch = requiereCuadre && Math.abs(sumaHaSemillas - haLote) > 0.01;

  const addSeed = () =>
    setSeedLines((prev) => [...prev, { id: '', varianteId: '', hectareas: '', dosisHa: DOSIS_SEMILLA_DEFAULT }]);
  const removeSeed = (i: number) => setSeedLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateSeed = (i: number, patch: Partial<SeedLine>) =>
    setSeedLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.hectareas) return;
    setError('');

    // Validación de semillas (varias variedades deben cuadrar con el total del lote)
    if (puedeGestionarSemillas && seedLines.length > 0) {
      if (seedLines.some((l) => !l.varianteId)) {
        setError('Hay líneas de semilla sin variedad seleccionada.');
        return;
      }
      if (requiereCuadre) {
        if (seedLines.some((l) => !l.hectareas || Number(l.hectareas) <= 0)) {
          setError('Con varias semillas, cada línea debe tener sus hectáreas.');
          return;
        }
        if (mismatch) {
          setError(
            `Las hectáreas de las semillas (${sumaHaSemillas.toLocaleString('es-VE', { maximumFractionDigits: 2 })} ha) no coinciden con el total del lote (${haLote.toLocaleString('es-VE', { maximumFractionDigits: 2 })} ha). Ajustá las líneas o agregá otra semilla.`,
          );
          return;
        }
      }
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    try {
      // 1. Lote
      const payload = {
        productor_id: productorId,
        nombre: form.nombre.trim(),
        hectareas: Number(form.hectareas),
        estado: form.estado || null,
      };

      let loteId = initialData?.id;
      if (isEdit) {
        const { error: err } = await supabase.from('lotes').update(payload).eq('id', initialData!.id);
        if (err) { setError(err.message); return; }
      } else {
        const { data, error: err } = await supabase.from('lotes').insert(payload).select('id').single();
        if (err) { setError(err.message); return; }
        loteId = data?.id;
      }

      // 2. Semillas (solo edición con plan)
      if (puedeGestionarSemillas && loteId) {
        // hectareas por línea: null si hay una sola variedad (cubre todo el lote)
        const haPorLinea = (l: SeedLine) => (seedLines.length >= 2 ? Number(l.hectareas) : null);

        // Borrar las que ya no están
        const idsActuales = seedLines.filter((l) => l.id).map((l) => l.id);
        const aBorrar = seedLinesIniciales.filter((l) => l.id && !idsActuales.includes(l.id)).map((l) => l.id);
        if (aBorrar.length) {
          const { error: err } = await supabase.from('plan_productos').delete().in('id', aBorrar);
          if (err) { setError(err.message); return; }
        }

        // Actualizar / insertar
        for (const l of seedLines) {
          if (l.id) {
            const { error: err } = await supabase
              .from('plan_productos')
              .update({ variante_id: l.varianteId, hectareas: haPorLinea(l), dosis_ha: l.dosisHa })
              .eq('id', l.id);
            if (err) { setError(err.message); return; }
          } else {
            const { error: err } = await supabase.from('plan_productos').insert({
              plan_id: planId,
              variante_id: l.varianteId,
              dosis_ha: l.dosisHa,
              lotes_ids: [loteId],
              hectareas: haPorLinea(l),
            });
            if (err) { setError(err.message); return; }
          }
        }
      }

      router.push(`/productores/${productorId}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <Input
            label="Nombre del lote *"
            value={form.nombre}
            onChange={set('nombre')}
            placeholder="L01 LOTE 1A"
            required
          />
          <Input
            label="Hectáreas *"
            type="number"
            step="0.01"
            min="0"
            value={form.hectareas}
            onChange={set('hectareas')}
            placeholder="0.00"
            required
          />
          <Select
            label="Estado"
            value={form.estado}
            onChange={set('estado')}
            placeholder="Seleccionar estado"
            options={ESTADOS_VE.map((e) => ({ value: e, label: e }))}
          />
        </CardBody>
      </Card>

      {/* ── Semillas del lote ─────────────────────────────────────────────── */}
      {puedeGestionarSemillas && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Semillas del lote</h3>
            <span className="text-xs text-slate-400">
              {seedLines.length >= 2
                ? `${sumaHaSemillas.toLocaleString('es-VE', { maximumFractionDigits: 2 })} / ${haLote.toLocaleString('es-VE', { maximumFractionDigits: 2 })} ha`
                : 'Una variedad cubre todo el lote'}
            </span>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-xs text-slate-500">
              Si el lote unificado tiene varias variedades, asigná las hectáreas de cada una.
              La suma debe igualar el total del lote.
            </p>

            {seedLines.length === 0 && (
              <p className="text-xs text-slate-400">Sin semillas asignadas.</p>
            )}

            {seedLines.map((l, i) => (
              <div key={l.id || `nueva-${i}`} className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Variedad</label>
                  <select
                    value={l.varianteId}
                    onChange={(e) => updateSeed(i, { varianteId: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  >
                    <option value="">Seleccioná…</option>
                    {seedCatalog.map((s) => (
                      <option key={s.varianteId} value={s.varianteId}>
                        {s.productoNombre} — {s.presentacion} {s.unidad}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Hectáreas</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.hectareas}
                    onChange={(e) => updateSeed(i, { hectareas: e.target.value })}
                    disabled={seedLines.length < 2}
                    placeholder={seedLines.length < 2 ? 'Todo el lote' : '0.00'}
                    className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSeed(i)}
                  className="mb-1 p-2 text-slate-400 hover:text-rose-600 transition-colors"
                  title="Quitar"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            <Button type="button" variant="secondary" size="sm" onClick={addSeed}>
              <Plus size={14} />
              Agregar semilla
            </Button>

            {mismatch && (
              <Alert variant="warning">
                Las hectáreas de las semillas suman{' '}
                {sumaHaSemillas.toLocaleString('es-VE', { maximumFractionDigits: 2 })} ha, pero el lote
                tiene {haLote.toLocaleString('es-VE', { maximumFractionDigits: 2 })} ha. Ajustá antes de guardar.
              </Alert>
            )}
          </CardBody>
        </Card>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex gap-3">
        <Button type="submit" loading={loading} disabled={mismatch}>
          {isEdit ? 'Guardar cambios' : 'Crear lote'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
