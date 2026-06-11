import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';

interface Tecnico {
  id: string;
  nombre: string;
  contacto: string | null;
}

interface Props {
  productor: {
    nombre: string;
    banco: string | null;
    credito_aprobado: number;
    estado: string | null;
    localidad: string | null;
    region: string | null;
    tecnico: Tecnico | null;
    coordinadores: { tecnico: Tecnico | null }[];
    gerente: Tecnico | null;
  };
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-slate-900">{value ?? <span className="text-slate-400">—</span>}</p>
    </div>
  );
}

function TecnicoField({ label, tecnico }: { label: string; tecnico: Tecnico | null }) {
  if (!tecnico) return <Field label={label} value={null} />;
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-slate-900">{tecnico.nombre}</p>
      {tecnico.contacto && <p className="text-xs text-slate-500">{tecnico.contacto}</p>}
    </div>
  );
}

function CoordinadoresField({ coordinadores }: { coordinadores: { tecnico: Tecnico | null }[] }) {
  const lista = coordinadores.map((c) => c.tecnico).filter((t): t is Tecnico => t !== null);
  const label = lista.length > 1 ? 'Coordinadores' : 'Coordinador';
  if (lista.length === 0) {
    return <Field label="Coordinador" value={<span className="text-slate-400">Por definir</span>} />;
  }
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="space-y-1.5">
        {lista.map((t) => (
          <div key={t.id}>
            <p className="text-sm text-slate-900">{t.nombre}</p>
            {t.contacto && <p className="text-xs text-slate-500">{t.contacto}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TabInfo({ productor }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Datos del Productor</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field label="Nombre completo" value={productor.nombre} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Estado" value={productor.estado} />
            <Field label="Región" value={productor.region} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Banco"
              value={productor.banco ? <Badge variant="blue">{productor.banco}</Badge> : null}
            />
            <Field
              label="Crédito aprobado"
              value={
                <span className="font-mono font-semibold text-green-700">
                  ${productor.credito_aprobado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
              }
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Equipo Técnico</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <TecnicoField label="Técnico asignado" tecnico={productor.tecnico} />
          <CoordinadoresField coordinadores={productor.coordinadores} />
          <TecnicoField label="Gerente" tecnico={productor.gerente} />
        </CardBody>
      </Card>
    </div>
  );
}
