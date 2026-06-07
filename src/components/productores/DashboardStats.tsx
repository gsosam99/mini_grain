import Card from '@/components/ui/Card';
import { Users, MapPin, DollarSign, TrendingUp } from 'lucide-react';
import { calcularRedondeo } from '@/lib/rounding';

interface DashboardStatsProps {
  productores: { id: string; credito_aprobado: number }[];
  lotes: { id: string; productor_id: string; hectareas: number }[];
  planProductos: {
    id: string;
    dosis_ha: number;
    lotes_ids: string[] | null;
    variante: { id: string; presentacion: number; precio: number } | null;
  }[];
}

export default function DashboardStats({ productores, lotes, planProductos }: DashboardStatsProps) {
  const totalHa = lotes.reduce((sum, l) => sum + l.hectareas, 0);
  const totalCredito = productores.reduce((sum, p) => sum + p.credito_aprobado, 0);

  const totalCostoPlan = planProductos.reduce((sum, pp) => {
    if (!pp.variante) return sum;
    const lotesAplicables = pp.lotes_ids
      ? lotes.filter((l) => pp.lotes_ids!.includes(l.id))
      : lotes;
    const ha = lotesAplicables.reduce((s, l) => s + l.hectareas, 0);
    const { costoTotal } = calcularRedondeo({
      dosisHa: pp.dosis_ha,
      hectareas: ha,
      presentacion: pp.variante.presentacion,
      precio: pp.variante.precio,
    });
    return sum + costoTotal;
  }, 0);

  const excedidos = productores.filter((p) => {
    const productorLotes = lotes.filter((l) => l.productor_id === p.id);
    const costo = planProductos.reduce((sum, pp) => {
      if (!pp.variante) return sum;
      const lotesAplicables = pp.lotes_ids
        ? productorLotes.filter((l) => pp.lotes_ids!.includes(l.id))
        : productorLotes;
      const ha = lotesAplicables.reduce((s, l) => s + l.hectareas, 0);
      if (ha === 0) return sum;
      const { costoTotal } = calcularRedondeo({
        dosisHa: pp.dosis_ha,
        hectareas: ha,
        presentacion: pp.variante.presentacion,
        precio: pp.variante.precio,
      });
      return sum + costoTotal;
    }, 0);
    return costo > p.credito_aprobado;
  }).length;

  const stats = [
    {
      label: 'Productores',
      value: productores.length,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Hectáreas totales',
      value: totalHa.toLocaleString('es-VE', { maximumFractionDigits: 1 }),
      icon: MapPin,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Crédito aprobado',
      value: `$${totalCredito.toLocaleString('es-VE', { maximumFractionDigits: 0 })}`,
      icon: DollarSign,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Costo total del plan',
      value: `$${totalCostoPlan.toLocaleString('es-VE', { maximumFractionDigits: 0 })}`,
      icon: TrendingUp,
      color: excedidos > 0 ? 'text-rose-600' : 'text-slate-600',
      bg: excedidos > 0 ? 'bg-rose-50' : 'bg-slate-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <div className={['rounded-lg p-2', stat.bg].join(' ')}>
                <stat.icon size={18} className={stat.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            {stat.label === 'Costo total del plan' && excedidos > 0 && (
              <p className="text-xs text-rose-600 mt-1">
                {excedidos} productor{excedidos > 1 ? 'es' : ''} excede{excedidos > 1 ? 'n' : ''} su crédito
              </p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
