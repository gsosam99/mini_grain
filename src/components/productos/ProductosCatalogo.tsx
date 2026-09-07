'use client';

import { useState, useMemo } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import { ChevronDown, ChevronRight, Plus, Pencil } from 'lucide-react';
import Link from 'next/link';
import AgregarVarianteModal from './AgregarVarianteModal';

interface Variante {
  id: string;
  unidad: string;
  presentacion: number;
  precio: number;
}

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  subcategoria: string | null;
  proveedor: { id: string; nombre: string } | null;
  variantes: Variante[];
}

export interface ProductosCatalogoProps {
  productos: Producto[];
  proveedores: { id: string; nombre: string }[];
}

export default function ProductosCatalogo({ productos, proveedores }: ProductosCatalogoProps) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [agregarVariante, setAgregarVariante] = useState<Producto | null>(null);
  const [localProductos, setLocalProductos] = useState(productos);

  const categorias = useMemo(
    () => [...new Set(localProductos.map((p) => p.categoria))].sort(),
    [localProductos]
  );

  const filtrados = useMemo(() => {
    const q = search.toLowerCase();
    return localProductos.filter((p) => {
      const matchSearch =
        !q || p.nombre.toLowerCase().includes(q) || p.proveedor?.nombre.toLowerCase().includes(q);
      const matchCat = !filterCat || p.categoria === filterCat;
      return matchSearch && matchCat;
    });
  }, [localProductos, search, filterCat]);

  const grupos = useMemo(() => {
    const g: Record<string, Producto[]> = {};
    for (const p of filtrados) {
      if (!g[p.categoria]) g[p.categoria] = [];
      g[p.categoria].push(p);
    }
    return g;
  }, [filtrados]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto o proveedor..."
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {Object.entries(grupos).map(([cat, items]) => (
        <Card key={cat}>
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">
              {cat} <span className="text-slate-400 font-normal">({items.length})</span>
            </h3>
          </div>
          <div className="divide-y divide-slate-50">
            {items.map((producto) => (
              <div key={producto.id}>
                <div
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                  onClick={() => toggle(producto.id)}
                >
                  <span className="text-slate-400">
                    {expanded.has(producto.id) ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{producto.nombre}</p>
                    <p className="text-xs text-slate-500">
                      {producto.proveedor?.nombre}
                      {producto.subcategoria && ` · ${producto.subcategoria}`}
                    </p>
                  </div>
                  <Badge variant="gray">{producto.variantes.length} variantes</Badge>
                  <Link
                    href={`/productos/${producto.id}/editar`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-400 hover:text-green-700 transition-colors ml-2"
                  >
                    <Pencil size={14} />
                  </Link>
                </div>

                {expanded.has(producto.id) && (
                  <div className="px-4 pb-3 ml-7">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-100">
                          <th className="text-left py-1.5 font-medium">Presentación</th>
                          <th className="text-left py-1.5 font-medium">Unidad</th>
                          <th className="text-right py-1.5 font-medium">Precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {producto.variantes.map((v) => (
                          <tr key={v.id} className="border-b border-slate-50">
                            <td className="py-1.5 font-mono">{v.presentacion}</td>
                            <td className="py-1.5 text-slate-600">{v.unidad}</td>
                            <td className="py-1.5 text-right font-mono font-semibold text-slate-900">
                              ${v.precio.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      onClick={() => setAgregarVariante(producto)}
                      className="mt-2 text-xs text-green-700 hover:text-green-900 flex items-center gap-1"
                    >
                      <Plus size={12} />
                      Agregar variante
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      {filtrados.length === 0 && (
        <div className="text-center py-12 text-slate-400">No se encontraron productos</div>
      )}

      {agregarVariante && (
        <AgregarVarianteModal
          open={!!agregarVariante}
          producto={agregarVariante}
          onClose={() => setAgregarVariante(null)}
          onAgregada={(variante) => {
            setLocalProductos((prev) =>
              prev.map((p) =>
                p.id === agregarVariante.id
                  ? { ...p, variantes: [...p.variantes, variante] }
                  : p
              )
            );
            setAgregarVariante(null);
          }}
        />
      )}
    </div>
  );
}
