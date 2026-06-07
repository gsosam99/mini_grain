'use client';

import { useState, useMemo } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Upload, Search } from 'lucide-react';
import UploadAnalisisModal from './UploadAnalisisModal';

interface Analisis {
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
  lote: {
    id: string;
    nombre: string;
    hectareas: number;
    productor: { id: string; nombre: string; estado: string | null } | null;
  } | null;
}

export interface AnalisisSuelosPanelProps {
  analisis: Analisis[];
}

export default function AnalisisSuelosPanel({ analisis: initialAnalisis }: AnalisisSuelosPanelProps) {
  const [analisis, setAnalisis] = useState(initialAnalisis);
  const [search, setSearch] = useState('');
  const [filterCal, setFilterCal] = useState<'todos' | 'si' | 'no'>('todos');
  const [uploadOpen, setUploadOpen] = useState(false);

  const filtrados = useMemo(() => {
    const q = search.toLowerCase();
    return analisis.filter((a) => {
      const matchSearch =
        !q ||
        a.lote?.nombre.toLowerCase().includes(q) ||
        a.lote?.productor?.nombre.toLowerCase().includes(q);
      const matchCal =
        filterCal === 'todos' ||
        (filterCal === 'si' && a.dosis_cal > 0) ||
        (filterCal === 'no' && a.dosis_cal === 0);
      return matchSearch && matchCal;
    });
  }, [analisis, search, filterCal]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por lote o productor..."
            className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-300"
          />
        </div>
        <select
          value={filterCal}
          onChange={(e) => setFilterCal(e.target.value as 'todos' | 'si' | 'no')}
          className="rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
        >
          <option value="todos">Todos</option>
          <option value="si">Necesita cal</option>
          <option value="no">Sin cal</option>
        </select>
        <Button size="sm" variant="secondary" onClick={() => setUploadOpen(true)}>
          <Upload size={14} />
          Cargar análisis
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Productor</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Lote</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Año</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Laboratorio</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Textural</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">pH</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Dosis Cal</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">TM Cal</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Kmag</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Magniplus</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Cal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                    Sin análisis registrados
                  </td>
                </tr>
              )}
              {filtrados.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-900 font-medium text-xs">
                    {a.lote?.productor?.nombre ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 text-xs">{a.lote?.nombre ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center text-slate-600 text-xs">{a.anio}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{a.laboratorio ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center text-slate-600 text-xs">{a.clase_textural ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{a.ph ?? '—'}</td>
                  <td className={['px-4 py-2.5 text-right font-mono text-xs', a.dosis_cal > 0 ? 'font-semibold text-amber-700' : 'text-slate-600'].join(' ')}>
                    {a.dosis_cal}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">{a.total_cal_tm}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">{a.total_kmag}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">{a.total_magniplus}</td>
                  <td className="px-4 py-2.5 text-center">
                    {a.dosis_cal > 0 ? <Badge variant="yellow">Sí</Badge> : <Badge variant="green">No</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {uploadOpen && (
        <UploadAnalisisModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onSubido={(nuevos) => {
            setAnalisis((prev) => [...(nuevos as Analisis[]), ...prev]);
            setUploadOpen(false);
          }}
        />
      )}
    </div>
  );
}
