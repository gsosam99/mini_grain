import { createSupabaseServerClient } from '@/lib/supabase/server';
import PageHeader from '@/components/layout/PageHeader';
import ProductorForm from '@/components/productores/ProductorForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function NuevoProductorPage() {
  const supabase = await createSupabaseServerClient();
  const { data: tecnicos } = await supabase
    .from('tecnicos')
    .select('id, nombre, rol')
    .order('nombre');

  return (
    <div>
      <Link
        href="/productores"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft size={14} />
        Productores
      </Link>
      <PageHeader title="Nuevo productor" />
      <ProductorForm tecnicos={tecnicos ?? []} />
    </div>
  );
}
