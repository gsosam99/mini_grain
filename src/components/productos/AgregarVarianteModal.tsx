'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { UNIDADES } from '@/types';

interface Props {
  open: boolean;
  producto: { id: string; nombre: string };
  onClose: () => void;
  onAgregada: (variante: { id: string; unidad: string; presentacion: number; precio: number }) => void;
}

export default function AgregarVarianteModal({ open, producto, onClose, onAgregada }: Props) {
  const [unidad, setUnidad] = useState('lt');
  const [presentacion, setPresentacion] = useState('');
  const [precio, setPrecio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGuardar = async () => {
    if (!presentacion || !precio) return;
    setLoading(true);
    setError('');

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .from('variantes_producto')
        .insert({
          producto_id: producto.id,
          unidad,
          presentacion: Number(presentacion),
          precio: Number(precio),
        })
        .select('id, unidad, presentacion, precio')
        .single();

      if (err) { setError(err.message); return; }
      onAgregada(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Nueva variante: ${producto.nombre}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Unidad"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            options={UNIDADES.map((u) => ({ value: u, label: u }))}
          />
          <Input
            label="Presentación (tamaño)"
            type="number"
            step="0.1"
            min="0"
            value={presentacion}
            onChange={(e) => setPresentacion(e.target.value)}
            placeholder="5"
            hint="Ej: 5 para un envase de 5lt"
          />
        </div>
        <Input
          label="Precio por unidad ($)"
          type="number"
          step="0.01"
          min="0"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder="0.00"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGuardar} loading={loading} disabled={!presentacion || !precio}>
            Agregar variante
          </Button>
        </div>
      </div>
    </Modal>
  );
}
