'use client';

import { useState } from 'react';
import type { Plan, Lote, HistorialCal } from '@/types';
import TabInfo from './tabs/TabInfo';
import TabLotes from './tabs/TabLotes';
import TabPlan from './tabs/TabPlan';
import TabCredito from './tabs/TabCredito';
import TabCambios from './tabs/TabCambios';

type Tab = 'plan' | 'credito' | 'cambios' | 'detalles';

interface Props {
  productor: {
    id: string;
    nombre: string;
    banco: string | null;
    credito_aprobado: number;
    estado: string | null;
    localidad: string | null;
    region: string | null;
    creditos: { id: string; banco: string; monto_aprobado: number }[];
    tecnico: { id: string; nombre: string; contacto: string | null } | null;
    coordinadores: { tecnico: { id: string; nombre: string; contacto: string | null } | null }[];
    gerente: { id: string; nombre: string; contacto: string | null } | null;
  };
  lotes: (Lote & {
    analisis_suelos: {
      id: string; anio: number; laboratorio: string | null; clase_textural: string | null;
      ph: number | null; dosis_cal: number; total_cal_tm: number;
      dosis_kmag: number; total_kmag: number; dosis_magniplus: number; total_magniplus: number;
    }[];
  })[];
  plan: (Plan & {
    plan_productos: {
      id: string; dosis_ha: number; lotes_ids: string[] | null; created_at: string;
      precio_override?: number | null; hectareas?: number | null;
      variante: {
        id: string; unidad: string; presentacion: number; precio: number;
        producto: { id: string; nombre: string; categoria: string; subcategoria: string | null;
          proveedor: { id: string; nombre: string } | null;
        } | null;
      } | null;
      plan_cambios: {
        id: string; tipo: string; dosis_original: number | null; dosis_nueva: number | null;
        motivo: string | null; fecha: string;
        variante_original: { id: string; unidad: string; presentacion: number; precio: number;
          producto: { id: string; nombre: string } | null;
        } | null;
        variante_nueva: { id: string; unidad: string; presentacion: number; precio: number;
          producto: { id: string; nombre: string } | null;
        } | null;
      }[];
    }[];
  }) | null;
  historialCal: HistorialCal[];
  productorId: string;
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Plan Agronómico' },
  { id: 'credito', label: 'Crédito' },
  { id: 'cambios', label: 'Cambios Logísticos' },
  { id: 'detalles', label: 'Detalles' },
];

export type ProductorTabsProps = Props;

export default function ProductorTabs({ productor, lotes, plan, historialCal, productorId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('plan');

  return (
    <div>
      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-0 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'plan' && (
        <TabPlan plan={plan} lotes={lotes} productorId={productorId} />
      )}
      {activeTab === 'credito' && (
        <TabCredito
          creditoAprobado={productor.credito_aprobado}
          banco={productor.banco}
          creditos={productor.creditos}
          plan={plan}
          lotes={lotes}
        />
      )}
      {activeTab === 'cambios' && <TabCambios plan={plan} />}
      {activeTab === 'detalles' && (
        <div className="space-y-6">
          <TabInfo productor={productor} />
          <TabLotes lotes={lotes} productorId={productorId} historialCal={historialCal} />
        </div>
      )}
    </div>
  );
}
