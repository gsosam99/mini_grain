'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card, { CardBody } from '@/components/ui/Card';
import { ESTADOS_VE } from '@/types';

interface Props {
  productorId: string;
  initialData?: {
    id: string;
    nombre: string;
    hectareas: number;
    estado: string | null;
  };
}

export default function LoteForm({ productorId, initialData }: Props) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [form, setForm] = useState({
    nombre: initialData?.nombre ?? '',
    hectareas: String(initialData?.hectareas ?? ''),
    estado: initialData?.estado ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.hectareas) return;
    setLoading(true);
    setError('');

    const supabase = createSupabaseBrowserClient();
    const payload = {
      productor_id: productorId,
      nombre: form.nombre.trim(),
      hectareas: Number(form.hectareas),
      estado: form.estado || null,
    };

    try {
      if (isEdit) {
        const { error: err } = await supabase
          .from('lotes')
          .update(payload)
          .eq('id', initialData.id);
        if (err) { setError(err.message); return; }
      } else {
        const { error: err } = await supabase.from('lotes').insert(payload);
        if (err) { setError(err.message); return; }
      }
      router.push(`/productores/${productorId}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg">
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

      {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}

      <div className="flex gap-3 mt-4">
        <Button type="submit" loading={loading}>
          {isEdit ? 'Guardar cambios' : 'Crear lote'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
