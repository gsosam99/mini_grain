-- Mini Grain — Schema SQL completo
-- Ciclo activo: 2026

-- ============================================================
-- TABLAS MAESTRAS
-- ============================================================

create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz default now()
);

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null,
  subcategoria text,
  proveedor_id uuid references proveedores(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists variantes_producto (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  unidad text not null,
  presentacion numeric not null,
  precio numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists tecnicos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rol text not null check (rol in ('tecnico', 'coordinador', 'gerente')),
  contacto text,
  created_at timestamptz default now()
);

-- ============================================================
-- PRODUCTORES Y LOTES
-- ============================================================

create table if not exists productores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  banco text,
  credito_aprobado numeric default 0,
  estado text,
  localidad text,
  tecnico_id uuid references tecnicos(id) on delete set null,
  coordinador_id uuid references tecnicos(id) on delete set null,
  gerente_id uuid references tecnicos(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists lotes (
  id uuid primary key default gen_random_uuid(),
  productor_id uuid not null references productores(id) on delete cascade,
  nombre text not null,
  hectareas numeric not null,
  estado text,
  created_at timestamptz default now()
);

-- ============================================================
-- ANÁLISIS DE SUELOS
-- ============================================================

create table if not exists analisis_suelos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes(id) on delete cascade,
  anio int not null,
  laboratorio text,
  clase_textural text,
  ph numeric,
  ca_me numeric,
  mg_me numeric,
  na_me numeric,
  k_me numeric,
  dosis_cal numeric default 0,
  total_cal_tm numeric default 0,
  dosis_kmag numeric default 0,
  total_kmag numeric default 0,
  dosis_magniplus numeric default 0,
  total_magniplus numeric default 0,
  created_at timestamptz default now(),
  unique(lote_id, anio)
);

-- ============================================================
-- PLANES AGRÍCOLAS
-- ============================================================

create table if not exists planes (
  id uuid primary key default gen_random_uuid(),
  productor_id uuid not null references productores(id) on delete cascade,
  ciclo int not null default 2026,
  created_at timestamptz default now(),
  unique(productor_id, ciclo)
);

-- Plan base por agricultor. lotes_ids = null → aplica a todos los lotes del agricultor.
create table if not exists plan_productos (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references planes(id) on delete cascade,
  variante_id uuid not null references variantes_producto(id),
  dosis_ha numeric not null,
  lotes_ids uuid[],
  created_at timestamptz default now()
);

-- Registro de cambios logísticos sobre un ítem del plan
create table if not exists plan_cambios (
  id uuid primary key default gen_random_uuid(),
  plan_producto_id uuid not null references plan_productos(id) on delete cascade,
  tipo text not null check (tipo in ('sustitucion_producto', 'cambio_variante', 'cambio_precio', 'cambio_dosis')),
  variante_original_id uuid references variantes_producto(id),
  variante_nueva_id uuid references variantes_producto(id),
  dosis_original numeric,
  dosis_nueva numeric,
  motivo text,
  fecha timestamptz default now()
);

-- ============================================================
-- HISTORIAL CAL
-- ============================================================

create table if not exists historial_cal (
  id uuid primary key default gen_random_uuid(),
  productor_id uuid not null references productores(id) on delete cascade,
  lote_id uuid references lotes(id) on delete set null,
  anio int not null,
  cantidad_tm numeric not null,
  costo numeric,
  tipo_cal text default 'Cal dolomítica',
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table proveedores enable row level security;
alter table productos enable row level security;
alter table variantes_producto enable row level security;
alter table tecnicos enable row level security;
alter table productores enable row level security;
alter table lotes enable row level security;
alter table analisis_suelos enable row level security;
alter table planes enable row level security;
alter table plan_productos enable row level security;
alter table plan_cambios enable row level security;
alter table historial_cal enable row level security;

-- Políticas: solo usuarios autenticados pueden leer y escribir
do $$
declare
  t text;
begin
  foreach t in array array[
    'proveedores','productos','variantes_producto','tecnicos',
    'productores','lotes','analisis_suelos','planes',
    'plan_productos','plan_cambios','historial_cal'
  ] loop
    execute format('
      create policy "auth_all_%s" on %I
        for all using (auth.role() = ''authenticated'')
        with check (auth.role() = ''authenticated'');
    ', t, t);
  end loop;
end $$;

-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_lotes_productor on lotes(productor_id);
create index if not exists idx_plan_productos_plan on plan_productos(plan_id);
create index if not exists idx_plan_cambios_plan_producto on plan_cambios(plan_producto_id);
create index if not exists idx_analisis_lote on analisis_suelos(lote_id);
create index if not exists idx_historial_cal_productor on historial_cal(productor_id);
create index if not exists idx_variantes_producto on variantes_producto(producto_id);
