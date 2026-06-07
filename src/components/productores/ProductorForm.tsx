'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import { BANCOS, ESTADOS_VE } from '@/types';

interface Tecnico {
  id: string;
  nombre: string;
  rol: string;
}

interface Props {
  tecnicos: Tecnico[];
  initialData?: {
    id: string;
    nombre: string;
    banco: string | null;
    credito_aprobado: number;
    estado: string | null;
    localidad: string | null;
    tecnico_id: string | null;
    coordinador_id: string | null;
    gerente_id: string | null;
  };
}

export default function ProductorForm({ tecnicos, initialData }: Props) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [form, setForm] = useState({
    nombre: initialData?.nombre ?? '',
    banco: initialData?.banco ?? '',
    credito_aprobado: String(initialData?.credito_aprobado ?? ''),
    estado: initialData?.estado ?? '',
    localidad: initialData?.localidad ?? '',
    tecnico_id: initialData?.tecnico_id ?? '',
    coordinador_id: initialData?.coordinador_id ?? '',
    gerente_id: initialData?.gerente_id ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const byRol = (rol: string) =>
    tecnicos
      .filter((t) => t.rol === rol)
      .map((t) => ({ value: t.id, label: t.nombre }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setLoading(true);
    setError('');

    const supabase = createSupabaseBrowserClient();
    const payload = {
      nombre: form.nombre.trim(),
      banco: form.banco || null,
      credito_aprobado: Number(form.credito_aprobado) || 0,
      estado: form.estado || null,
      localidad: form.localidad || null,
      tecnico_id: form.tecnico_id || null,
      coordinador_id: form.coordinador_id || null,
      gerente_id: form.gerente_id || null,
    };

    try {
      if (isEdit) {
        const { error: err } = await supabase
          .from('productores')
          .update(payload)
          .eq('id', initialData.id);
        if (err) { setError(err.message); return; }
        router.push(`/productores/${initialData.id}`);
      } else {
        const { data, error: err } = await supabase
          .from('productores')
          .insert(payload)
          .select('id')
          .single();
        if (err) { setError(err.message); return; }
        router.push(`/productores/${data.id}`);
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Datos básicos</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="Nombre completo *"
            value={form.nombre}
            onChange={set('nombre')}
            placeholder="Antonio Luis Zambrano Acuña"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Estado"
              value={form.estado}
              onChange={set('estado')}
              placeholder="Seleccionar estado"
              options={ESTADOS_VE.map((e) => ({ value: e, label: e }))}
            />
            <Input
              label="Localidad"
              value={form.localidad}
              onChange={set('localidad')}
              placeholder="Turén"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Banco"
              value={form.banco}
              onChange={set('banco')}
              placeholder="Seleccionar banco"
              options={BANCOS.map((b) => ({ value: b, label: b }))}
            />
            <Input
              label="Crédito aprobado ($)"
              type="number"
              step="0.01"
              min="0"
              value={form.credito_aprobado}
              onChange={set('credito_aprobado')}
              placeholder="0.00"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Equipo técnico</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <Select
            label="Técnico asignado"
            value={form.tecnico_id}
            onChange={set('tecnico_id')}
            placeholder="Sin asignar"
            options={byRol('tecnico')}
          />
          <Select
            label="Coordinador"
            value={form.coordinador_id}
            onChange={set('coordinador_id')}
            placeholder="Sin asignar"
            options={byRol('coordinador')}
          />
          <Select
            label="Gerente"
            value={form.gerente_id}
            onChange={set('gerente_id')}
            placeholder="Sin asignar"
            options={byRol('gerente')}
          />
        </CardBody>
      </Card>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" loading={loading}>
          {isEdit ? 'Guardar cambios' : 'Crear productor'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
