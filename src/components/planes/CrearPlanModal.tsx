'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  open: boolean;
  productorId: string;
  onClose: () => void;
  onCreado: (plan: { id: string; ciclo: number; plan_productos: [] } | null) => void;
}

export default function CrearPlanModal({ open, productorId, onClose, onCreado }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCrear = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .from('planes')
        .insert({ productor_id: productorId, ciclo: 2026 })
        .select('id, ciclo')
        .single();

      if (err) {
        setError(err.message);
        return;
      }

      onCreado({ id: data.id, ciclo: data.ciclo, plan_productos: [] });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Crear plan agrícola 2026">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Se creará el plan agrícola para el ciclo 2026. Luego podrás agregar los productos y dosis.
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleCrear} loading={loading}>
            Crear plan
          </Button>
        </div>
      </div>
    </Modal>
  );
}
