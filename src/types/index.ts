// Tipos del dominio — Mini Grain

export interface Proveedor {
  id: string;
  nombre: string;
  created_at: string;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  subcategoria: string | null;
  proveedor_id: string | null;
  created_at: string;
  proveedor?: Proveedor;
  variantes?: VarianteProducto[];
}

export interface VarianteProducto {
  id: string;
  producto_id: string;
  unidad: string;
  presentacion: number;
  precio: number;
  created_at: string;
  producto?: Producto;
}

export type RolTecnico = 'tecnico' | 'coordinador' | 'gerente';

export interface Tecnico {
  id: string;
  nombre: string;
  rol: RolTecnico;
  contacto: string | null;
  created_at: string;
}

export interface Productor {
  id: string;
  nombre: string;
  banco: string | null;
  credito_aprobado: number;
  estado: string | null;
  localidad: string | null;
  tecnico_id: string | null;
  coordinador_id: string | null;
  gerente_id: string | null;
  created_at: string;
  tecnico?: Tecnico;
  coordinador?: Tecnico;
  gerente?: Tecnico;
  lotes?: Lote[];
  plan?: Plan;
}

export interface Lote {
  id: string;
  productor_id: string;
  nombre: string;
  hectareas: number;
  estado: string | null;
  created_at: string;
  analisis_suelos?: AnalisisSuelos[];
}

export interface AnalisisSuelos {
  id: string;
  lote_id: string;
  anio: number;
  laboratorio: string | null;
  clase_textural: string | null;
  ph: number | null;
  ca_me: number | null;
  mg_me: number | null;
  na_me: number | null;
  k_me: number | null;
  dosis_cal: number;
  total_cal_tm: number;
  dosis_kmag: number;
  total_kmag: number;
  dosis_magniplus: number;
  total_magniplus: number;
  created_at: string;
  lote?: Lote;
}

export interface Plan {
  id: string;
  productor_id: string;
  ciclo: number;
  created_at: string;
  plan_productos?: PlanProducto[];
}

export interface PlanProducto {
  id: string;
  plan_id: string;
  variante_id: string;
  dosis_ha: number;
  lotes_ids: string[] | null;
  precio_override: number | null;
  created_at: string;
  variante?: VarianteProducto & { producto?: Producto };
  plan_cambios?: PlanCambio[];
}

export type TipoCambio = 'sustitucion_producto' | 'cambio_variante' | 'cambio_precio' | 'cambio_dosis';

export interface PlanCambio {
  id: string;
  plan_producto_id: string;
  tipo: TipoCambio;
  variante_original_id: string | null;
  variante_nueva_id: string | null;
  dosis_original: number | null;
  dosis_nueva: number | null;
  motivo: string | null;
  fecha: string;
  variante_original?: VarianteProducto & { producto?: Producto };
  variante_nueva?: VarianteProducto & { producto?: Producto };
}

export interface HistorialCal {
  id: string;
  productor_id: string;
  lote_id: string | null;
  anio: number;
  cantidad_tm: number;
  costo: number | null;
  tipo_cal: string;
  created_at: string;
  lote?: Lote;
}

// Tipos calculados

export interface ResultadoRedondeo {
  totalSinRedondear: number;
  unidadesNecesarias: number;
  costoTotal: number;
}

export interface ResumenCredito {
  creditoAprobado: number;
  costoTotalPlan: number;
  delta: number;
  porcentajeUsado: number;
  estado: 'ok' | 'advertencia' | 'excedido';
}

export interface PlanProductoCalculado extends PlanProducto {
  hectareasAplicables: number;
  redondeo: ResultadoRedondeo;
  tieneCambios: boolean;
}

// Constantes de dominio

export const CATEGORIAS_PRODUCTO = [
  '1. Insumos',
  '2. Mecanización',
  '3. Financiamiento',
  'Enmienda',
  'Otros',
] as const;

export const SUBCATEGORIAS_PRODUCTO: Record<string, string[]> = {
  '1. Insumos': [
    'Agroq. /Bio. /Mej.',
    'Enmienda',
    'Enmienda AA',
    'Fertilizante Básico: Fórmula',
    'Fertilizante Reabono 1',
    'Fertilizante Reabono 2',
    'Fertilizante Reabono: Urea',
    'Flete de Fertilizantes',
    'Semilla de Pasto',
    'Semillas de Maíz',
    'Tecnología & Asistencia Técnica',
  ],
  '2. Mecanización': [
    'Avioneta',
    'Coqueo',
    'Cosechadora',
    'Flete de cosecha',
    'Pase de Subsolador',
    'Pase de asperjadora',
    'Pase de encaladora',
    'Pase de rastra',
    'Pase de rotativa',
    'Pase de trompo (Reabono)',
    'Personal: labores, comidas, seguridad',
    'Sembradora',
  ],
  '3. Financiamiento': ['Financiamiento'],
  'Enmienda': ['Enmienda'],
  'Otros': ['Otros'],
};

export const BANCOS = ['Mercantil', 'Provincial', 'Otro'] as const;
export const ESTADOS_VE = [
  'Portuguesa', 'Guárico', 'Barinas', 'Cojedes', 'Apure', 'Anzoátegui', 'Monagas', 'Otro',
] as const;
export const UNIDADES = ['lt', 'kg', 'saco', 'und', 'g'] as const;
export const CICLO_ACTIVO = 2026;
