'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import SortableHeader from '@/components/ui/SortableHeader';
import { useSortable, applySortable } from '@/hooks/useSortable';
import { Search, ChevronRight } from 'lucide-react';

interface Productor {
  id: string;
  nombre: string;
  banco: string | null;
  credito_aprobado: number;
  estado: string | null;
  localidad: string | null;
  tecnico: { id: string; nombre: string; contacto: string | null } | null;
}

interface Props {
  productores: Productor[];
  lotes: { id: string; productor_id: string; hectareas: number }[];
}

type SortKey = 'nombre' | 'estado' | 'banco' | 'ha' | 'credito' | 'tecnico';

export default function ProductoresTable({ productores, lotes }: Props) {
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterBanco, setFilterBanco] = useState('');
  const { sort, toggle } = useSortable<SortKey>('nombre');

  const estados = useMemo(
    () => [...new Set(productores.map((p) => p.estado).filter(Boolean))],
    [productores]
  );
  const bancos = useMemo(
    () => [...new Set(productores.map((p) => p.banco).filter(Boolean))],
    [productores]
  );

  const getHa = (id: string) =>
    lotes.filter((l) => l.productor_id === id).reduce((s, l) => s + l.hectareas, 0);

  const filtrados = useMemo(() => {
    const filtered = productores.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.localidad?.toLowerCase().includes(q) ||
        p.tecnico?.nombre.toLowerCase().includes(q);
      const matchEstado = !filterEstado || p.estado === filterEstado;
      const matchBanco = !filterBanco || p.banco === filterBanco;
      return matchSearch && matchEstado && matchBanco;
    });
    return applySortable(filtered, sort, (p, key) => ({
      nombre: p.nombre,
      estado: p.estado ?? '',
      banco: p.banco ?? '',
      ha: getHa(p.id),
      credito: p.credito_aprobado,
      tecnico: p.tecnico?.nombre ?? '',
    }[key]));
  }, [productores, lotes, search, filterEstado, filterBanco, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, localidad o técnico..."
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-300"
            />
          </div>
        </div>
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
        >
          <option value="">Todos los estados</option>
          {estados.map((e) => (
            <option key={e} value={e!}>
              {e}
            </option>
          ))}
        </select>
        <select
          value={filterBanco}
          onChange={(e) => setFilterBanco(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
        >
          <option value="">Todos los bancos</option>
          {bancos.map((b) => (
            <option key={b} value={b!}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <SortableHeader label="Productor" sortKey="nombre" currentKey={sort.key} dir={sort.dir} onSort={toggle} />
                <SortableHeader label="Estado / Localidad" sortKey="estado" currentKey={sort.key} dir={sort.dir} onSort={toggle} />
                <SortableHeader label="Banco" sortKey="banco" currentKey={sort.key} dir={sort.dir} onSort={toggle} />
                <SortableHeader label="Ha" sortKey="ha" currentKey={sort.key} dir={sort.dir} onSort={toggle} align="right" />
                <SortableHeader label="Crédito aprobado" sortKey="credito" currentKey={sort.key} dir={sort.dir} onSort={toggle} align="right" />
                <SortableHeader label="Técnico" sortKey="tecnico" currentKey={sort.key} dir={sort.dir} onSort={toggle} />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No se encontraron productores
                  </td>
                </tr>
              )}
              {filtrados.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/productores/${p.id}`}
                      className="font-medium text-slate-900 hover:text-green-700 transition-colors"
                    >
                      {p.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.estado}
                    {p.localidad && <span className="text-slate-400"> · {p.localidad}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.banco ? <Badge variant="blue">{p.banco}</Badge> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900">
                    {getHa(p.id).toLocaleString('es-VE', { maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900">
                    ${p.credito_aprobado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {p.tecnico?.nombre ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/productores/${p.id}`} className="text-slate-400 hover:text-green-700">
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
