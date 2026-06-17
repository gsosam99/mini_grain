import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import PageHeader from '@/components/layout/PageHeader';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { ArrowLeft, Pencil } from 'lucide-react';

interface Props {
  params: Promise<{ id: string; loteId: string }>;
}

export default async function LoteDetailPage({ params }: Props) {
  const { id, loteId } = await params;
  const supabase = await createSupabaseServerClient();

  const [loteRes, historialRes] = await Promise.all([
    supabase
      .from('lotes')
      .select(`
        id, nombre, hectareas, estado,
        productor:productores(id, nombre),
        analisis_suelos(
          id, anio, laboratorio, clase_textural, ph,
          ca_me, mg_me, na_me, k_me,
          dosis_cal, total_cal_tm, dosis_kmag, total_kmag,
          dosis_magniplus, total_magniplus
        )
      `)
      .eq('id', loteId)
      .eq('productor_id', id)
      .single(),
    supabase
      .from('historial_cal')
      .select('id, anio, cantidad_tm, costo, tipo_cal')
      .eq('lote_id', loteId)
      .order('anio', { ascending: false }),
  ]);

  if (loteRes.error || !loteRes.data) notFound();
  const lote = loteRes.data;
  const historial = historialRes.data ?? [];

  return (
    <div>
      <Link
        href={`/productores/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft size={14} />
        {(lote.productor as unknown as { nombre: string } | null)?.nombre ?? 'Productor'}
      </Link>
      <PageHeader
        title={lote.nombre}
        description={`${lote.hectareas} Ha${lote.estado ? ' · ' + lote.estado : ''}`}
        actions={
          <Link href={`/productores/${id}/lotes/${loteId}/editar`}>
            <Button variant="secondary" size="sm">
              <Pencil size={14} />
              Editar
            </Button>
          </Link>
        }
      />

      <div className="space-y-6">
        {lote.analisis_suelos.length > 0 ? (
          lote.analisis_suelos.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <h3 className="text-sm font-semibold text-slate-900">
                  Análisis de Suelos {a.anio}
                  {a.laboratorio && <span className="text-slate-400 font-normal ml-2">· {a.laboratorio}</span>}
                </h3>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <SoilField label="Clase textural" value={a.clase_textural} />
                  <SoilField label="pH" value={a.ph} />
                  <SoilField label="Ca me/100g" value={a.ca_me} />
                  <SoilField label="Mg me/100g" value={a.mg_me} />
                  <SoilField label="Na me/100g" value={a.na_me} />
                  <SoilField label="K me/100g" value={a.k_me} />
                  <SoilField
                    label="Dosis Cal (TM/Ha)"
                    value={a.dosis_cal}
                    highlight={a.dosis_cal > 0}
                  />
                  <SoilField label="Total Cal (TM)" value={a.total_cal_tm} />
                  <SoilField label="Dosis Kmag" value={a.dosis_kmag} />
                  <SoilField label="Total Kmag" value={a.total_kmag} />
                  <SoilField label="Dosis Magniplus" value={a.dosis_magniplus} />
                  <SoilField label="Total Magniplus" value={a.total_magniplus} />
                </div>
              </CardBody>
            </Card>
          ))
        ) : (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-400 text-center py-4">Sin análisis de suelos registrados</p>
            </CardBody>
          </Card>
        )}

        {historial.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-900">Historial de Cal</h3>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Año</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Tipo</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Cantidad (TM)</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Costo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historial.map((h) => (
                    <tr key={h.id}>
                      <td className="px-4 py-2 text-slate-900">{h.anio}</td>
                      <td className="px-4 py-2 text-slate-600">{h.tipo_cal}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-900">{h.cantidad_tm}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-700">
                        {h.costo != null ? `$${h.costo.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function SoilField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number | null | undefined;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className={['text-sm', highlight ? 'font-semibold text-amber-700' : 'text-slate-900'].join(' ')}>
        {value != null ? String(value) : '—'}
      </p>
    </div>
  );
}
