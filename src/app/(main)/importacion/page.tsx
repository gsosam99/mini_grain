import PageHeader from '@/components/layout/PageHeader';
import ImportacionPanel from '@/components/importacion/ImportacionPanel';

export default function ImportacionPage() {
  return (
    <div>
      <PageHeader
        title="Importación / Exportación"
        description="Carga masiva de datos y descarga del plan en Excel"
      />
      <ImportacionPanel />
    </div>
  );
}
