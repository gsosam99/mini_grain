'use client';

import { useState, useRef, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Upload } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubido: (nuevos: object[]) => void;
}

interface AnalisisRow {
  productor_homologo: string;
  lote_equivalencia: string;
  hectareas: number;
  anio: number;
  laboratorio: string;
  clase_textural: string;
  ph: number;
  ca_me: number;
  mg_me: number;
  na_me: number;
  k_me: number;
  dosis_cal: number;
  total_cal_tm: number;
  dosis_kmag: number;
  total_kmag: number;
  dosis_magniplus: number;
  total_magniplus: number;
}

export default function UploadAnalisisModal({ open, onClose, onSubido }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<AnalisisRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; errores: string[] } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    const { read, utils } = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = utils.sheet_to_json<string[]>(ws, { header: 1 });

    if (data.length < 2) {
      setError('El archivo no tiene datos');
      return;
    }

    const parsed: AnalisisRow[] = data.slice(1).map((row) => ({
      anio: Number(row[0]) || 2026,
      productor_homologo: String(row[2] ?? ''),
      lote_equivalencia: String(row[5] ?? ''),
      hectareas: Number(row[6]) || 0,
      clase_textural: String(row[7] ?? ''),
      ph: Number(row[8]) || 0,
      ca_me: Number(row[9]) || 0,
      mg_me: Number(row[11]) || 0,
      na_me: Number(row[12]) || 0,
      k_me: Number(row[13]) || 0,
      dosis_cal: Number(row[14]) || 0,
      total_cal_tm: Number(row[15]) || 0,
      dosis_kmag: Number(row[16]) || 0,
      total_kmag: Number(row[17]) || 0,
      dosis_magniplus: Number(row[18]) || 0,
      total_magniplus: Number(row[19]) || 0,
      laboratorio: String(row[4] ?? ''),
    })).filter((r) => r.lote_equivalencia && r.productor_homologo);

    setRows(parsed);
    setPreview(true);
  }, []);

  const handleImportar = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    setError('');

    const supabase = createSupabaseBrowserClient();
    const errores: string[] = [];
    let ok = 0;

    for (const row of rows) {
      const { data: productor } = await supabase
        .from('productores')
        .select('id')
        .ilike('nombre', `%${row.productor_homologo.trim()}%`)
        .maybeSingle();

      if (!productor) {
        errores.push(`Productor no encontrado: ${row.productor_homologo}`);
        continue;
      }

      const { data: lote } = await supabase
        .from('lotes')
        .select('id')
        .eq('productor_id', productor.id)
        .ilike('nombre', `%${row.lote_equivalencia.trim()}%`)
        .maybeSingle();

      if (!lote) {
        errores.push(`Lote no encontrado: ${row.lote_equivalencia} (${row.productor_homologo})`);
        continue;
      }

      const { error: upsertErr } = await supabase
        .from('analisis_suelos')
        .upsert(
          {
            lote_id: lote.id,
            anio: row.anio,
            laboratorio: row.laboratorio || null,
            clase_textural: row.clase_textural || null,
            ph: row.ph || null,
            ca_me: row.ca_me || null,
            mg_me: row.mg_me || null,
            na_me: row.na_me || null,
            k_me: row.k_me || null,
            dosis_cal: row.dosis_cal,
            total_cal_tm: row.total_cal_tm,
            dosis_kmag: row.dosis_kmag,
            total_kmag: row.total_kmag,
            dosis_magniplus: row.dosis_magniplus,
            total_magniplus: row.total_magniplus,
          },
          { onConflict: 'lote_id,anio' }
        );

      if (upsertErr) {
        errores.push(`Error en ${row.lote_equivalencia}: ${upsertErr.message}`);
      } else {
        ok++;
      }
    }

    setResultado({ ok, errores });
    setLoading(false);

    if (ok > 0) {
      const { data: nuevos } = await supabase
        .from('analisis_suelos')
        .select(`
          id, anio, laboratorio, clase_textural, ph,
          dosis_cal, total_cal_tm, dosis_kmag, total_kmag, dosis_magniplus, total_magniplus,
          lote:lotes(id, nombre, hectareas, productor:productores(id, nombre, estado))
        `)
        .order('anio', { ascending: false })
        .limit(ok);
      onSubido(nuevos ?? []);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Cargar análisis de suelos" size="lg">
      <div className="space-y-4">
        {!preview ? (
          <>
            <Alert variant="info">
              Cargá el Excel del laboratorio en el formato original (pestaña "Analisis de Suelos").
              Columnas esperadas: Año, Estado, Productor, Unidad de producción, Laboratorio, Equivalencia Lotes, Ha, Textural, pH, Ca, Ca mg, Mg, Na, K, Dosis Cal, Total Cal...
            </Alert>
            <div
              className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-green-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={32} className="mx-auto mb-3 text-slate-400" />
              <p className="text-sm text-slate-600">Clic para seleccionar el archivo Excel</p>
              <p className="text-xs text-slate-400 mt-1">.xlsx, .xls</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          </>
        ) : resultado ? (
          <div className="space-y-3">
            <Alert variant={resultado.ok > 0 ? 'success' : 'error'}>
              {resultado.ok} análisis importados correctamente.
              {resultado.errores.length > 0 && ` ${resultado.errores.length} errores.`}
            </Alert>
            {resultado.errores.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                {resultado.errores.map((e, i) => (
                  <p key={i} className="text-xs text-rose-600">{e}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>Cerrar</Button>
            </div>
          </div>
        ) : (
          <>
            <Alert variant="info">
              Se encontraron <strong>{rows.length} filas</strong> en el archivo.
            </Alert>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg text-xs">
              <table className="w-full">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Productor</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Lote</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">pH</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">Dosis Cal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-slate-700">{r.productor_homologo}</td>
                      <td className="px-3 py-1.5 text-slate-600">{r.lote_equivalencia}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{r.ph}</td>
                      <td className={['px-3 py-1.5 text-right font-mono', r.dosis_cal > 0 ? 'text-amber-700 font-semibold' : ''].join(' ')}>
                        {r.dosis_cal}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreview(false)}>Volver</Button>
              <Button onClick={handleImportar} loading={loading}>
                Importar {rows.length} análisis
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
