'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Plus, FlaskConical } from 'lucide-react';
import type { HistorialCal } from '@/types';

interface AnalisisSuelos {
  id: string;
  anio: number;
  laboratorio: string | null;
  clase_textural: string | null;
  ph: number | null;
  dosis_cal: number;
  total_cal_tm: number;
  dosis_kmag: number;
  total_kmag: number;
  dosis_magniplus: number;
  total_magniplus: number;
}

interface Lote {
  id: string;
  nombre: string;
  hectareas: number;
  estado: string | null;
  analisis_suelos: AnalisisSuelos[];
}

interface Props {
  lotes: Lote[];
  productorId: string;
  historialCal: HistorialCal[];
}

const CICLO_ACTIVO = 2026;

function necesitaCal(analisis: AnalisisSuelos[], historial: HistorialCal[], loteId: string): 'si' | 'no' | 'desconocido' {
  const ultimoAnalisis = analisis.find((a) => a.anio === CICLO_ACTIVO);
  if (!ultimoAnalisis) return 'desconocido';
  if (ultimoAnalisis.dosis_cal === 0) return 'no';

  const calReciente = historial.find(
    (h) => h.lote_id === loteId && (h.anio === CICLO_ACTIVO - 1 || h.anio === CICLO_ACTIVO - 2)
  );
  if (calReciente) return 'no';
  return 'si';
}

export default function TabLotes({ lotes, productorId, historialCal }: Props) {
  const totalHa = lotes.reduce((s, l) => s + l.hectareas, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {lotes.length} lotes · {totalHa.toLocaleString('es-VE', { maximumFractionDigits: 1 })} Ha totales
        </p>
        <Link href={`/productores/${productorId}/lotes/nuevo`}>
          <Button size="sm" variant="secondary">
            <Plus size={14} />
            Nuevo lote
          </Button>
        </Link>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Lote</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Ha</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Análisis suelos</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Cal necesaria</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lotes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Sin lotes registrados
                  </td>
                </tr>
              )}
              {lotes.map((lote) => {
                const calStatus = necesitaCal(lote.analisis_suelos, historialCal, lote.id);
                const tieneAnalisis = lote.analisis_suelos.length > 0;
                return (
                  <tr key={lote.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{lote.nombre}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900">
                      {lote.hectareas.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{lote.estado ?? '—'}</td>
                    <td className="px-4 py-3">
                      {tieneAnalisis ? (
                        <div className="flex items-center gap-1.5 text-green-700">
                          <FlaskConical size={14} />
                          <span className="text-xs">
                            {lote.analisis_suelos[0].anio} · pH {lote.analisis_suelos[0].ph ?? '—'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Sin análisis</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {calStatus === 'si' && <Badge variant="yellow">Necesita cal</Badge>}
                      {calStatus === 'no' && <Badge variant="green">OK</Badge>}
                      {calStatus === 'desconocido' && <Badge variant="gray">Sin datos</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/productores/${productorId}/lotes/${lote.id}`}
                        className="text-xs text-green-700 hover:text-green-900 font-medium"
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
