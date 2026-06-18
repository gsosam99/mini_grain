'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import {
  Download, Upload, FileSpreadsheet,
  CheckCircle, AlertTriangle, XCircle,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { descargarTemplateImportacion } from '@/lib/export';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// ─── Helpers de normalización ───────────────────────────────────────────────

function normalizar(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function matchNombre(a: string, b: string): boolean {
  return normalizar(a) === normalizar(b);
}

function sugerirCercano(busqueda: string, opciones: string[]): string | null {
  const palabras = normalizar(busqueda).split(/\s+/);
  let mejorScore = 0;
  let mejor: string | null = null;
  for (const opcion of opciones) {
    const palabrasOpcion = normalizar(opcion).split(/\s+/);
    const coincidencias = palabras.filter((p) => palabrasOpcion.includes(p)).length;
    const score = coincidencias / Math.max(palabras.length, palabrasOpcion.length);
    if (score > mejorScore) { mejorScore = score; mejor = opcion; }
  }
  return mejorScore > 0.4 ? mejor : null;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

type EstadoMatch = 'ok' | 'nuevo' | 'advertencia' | 'error';

interface FilaValidada {
  indice: number;
  hoja: string;
  descripcion: string;
  estado: EstadoMatch;
  detalle: string;
}

interface ResultadoImport {
  tecnicos: number;
  productos: number;
  productores: number;
  lotes: number;
  planProductos: number;
  errores: string[];
  warnings: string[];
}

interface DatosExistentes {
  tecnicos: { id: string; nombre: string; rol: string }[];
  productos: { id: string; nombre: string }[];
  productores: { id: string; nombre: string }[];
  lotes: { id: string; nombre: string; productor_id: string }[];
}

/** Conjuntos de nombres presentes en las hojas del archivo (para validación cross-sheet). */
interface DatosEnArchivo {
  tecnicos: { nombre: string; rol: string }[];
  productos: { nombre: string }[];
  productores: { nombre: string }[];
  lotes: { nombreProductor: string; nombreLote: string }[];
}

type Fase = 'inicial' | 'preview' | 'importando' | 'resultado';

// ─── Parsear el archivo una sola vez y extraer todas las hojas ───────────────

async function parsearArchivo(file: File): Promise<{
  tecnicos: { Nombre: string; Rol: string; Contacto?: string }[];
  productos: { Proveedor?: string; Nombre: string; Categoría: string; Subcategoría?: string; Presentación: number; Unidad: string; Precio: number }[];
  productores: { Nombre: string; Banco?: string; 'Crédito Aprobado'?: number; Estado?: string; Localidad?: string; 'Nombre Técnico'?: string; 'Nombre Coordinador'?: string; 'Nombre Gerente'?: string }[];
  lotes: { 'Nombre Productor': string; 'Nombre Lote': string; Hectáreas: number; Estado?: string }[];
  plan: { 'Nombre Productor': string; 'Nombre Lote'?: string; 'Nombre Producto': string; 'Dosis/Ha': number }[];
}> {
  const { read, utils } = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = read(buffer, { type: 'array' });

  // Nota: usamos función nombrada en lugar de arrow-generic para evitar el problema <T> en TSX
  function parseHoja<T,>(hoja: string): T[] {
    return wb.Sheets[hoja] ? (utils.sheet_to_json(wb.Sheets[hoja]) as T[]) : [];
  }

  return {
    tecnicos: parseHoja<{ Nombre: string; Rol: string; Contacto?: string }>('Técnicos'),
    productos: parseHoja<{ Proveedor?: string; Nombre: string; Categoría: string; Subcategoría?: string; Presentación: number; Unidad: string; Precio: number }>('Productos'),
    productores: parseHoja<{ Nombre: string; Banco?: string; 'Crédito Aprobado'?: number; Estado?: string; Localidad?: string; 'Nombre Técnico'?: string; 'Nombre Coordinador'?: string; 'Nombre Gerente'?: string }>('Productores'),
    lotes: parseHoja<{ 'Nombre Productor': string; 'Nombre Lote': string; Hectáreas: number; Estado?: string }>('Lotes'),
    plan: parseHoja<{ 'Nombre Productor': string; 'Nombre Lote'?: string; 'Nombre Producto': string; 'Dosis/Ha': number }>('Plan'),
  };
}

// ─── Validación previa (sin escribir a BD) ────────────────────────────────────

async function validarArchivo(file: File, db: DatosExistentes): Promise<FilaValidada[]> {
  const hojas = await parsearArchivo(file);
  const filas: FilaValidada[] = [];
  let idx = 0;

  // Construir sets "en-archivo" para validación cross-sheet
  const enArchivo: DatosEnArchivo = {
    tecnicos: hojas.tecnicos
      .filter((r) => r.Nombre?.trim())
      .map((r) => ({ nombre: r.Nombre.trim(), rol: r.Rol?.trim().toLowerCase() ?? '' })),
    productos: hojas.productos
      .filter((r) => r.Nombre?.trim())
      .map((r) => ({ nombre: r.Nombre.trim() })),
    productores: hojas.productores
      .filter((r) => r.Nombre?.trim())
      .map((r) => ({ nombre: r.Nombre.trim() })),
    lotes: hojas.lotes
      .filter((r) => r['Nombre Productor']?.trim() && r['Nombre Lote']?.trim())
      .map((r) => ({ nombreProductor: r['Nombre Productor'].trim(), nombreLote: r['Nombre Lote'].trim() })),
  };

  const tecnicoDisponible = (nombre: string, rol: string): boolean =>
    db.tecnicos.some((t) => matchNombre(t.nombre, nombre) && t.rol === rol) ||
    enArchivo.tecnicos.some((t) => matchNombre(t.nombre, nombre) && t.rol === rol);

  const productoDisponible = (nombre: string): boolean =>
    db.productos.some((p) => matchNombre(p.nombre, nombre)) ||
    enArchivo.productos.some((p) => matchNombre(p.nombre, nombre));

  const productorDisponible = (nombre: string): boolean =>
    db.productores.some((p) => matchNombre(p.nombre, nombre)) ||
    enArchivo.productores.some((p) => matchNombre(p.nombre, nombre));

  // ── Técnicos ──────────────────────────────────────────────────────────────
  for (const row of hojas.tecnicos) {
    if (!row.Nombre?.trim()) continue;
    const existeEnBD = db.tecnicos.some(
      (t) => matchNombre(t.nombre, row.Nombre) && t.rol === row.Rol?.trim().toLowerCase()
    );
    filas.push({
      indice: idx++, hoja: 'Técnicos',
      descripcion: `${row.Nombre.trim()} (${row.Rol})`,
      estado: existeEnBD ? 'ok' : 'nuevo',
      detalle: existeEnBD ? 'Actualizará el contacto si cambió' : 'Se creará nuevo técnico',
    });
  }

  // ── Productos ─────────────────────────────────────────────────────────────
  for (const row of hojas.productos) {
    if (!row.Nombre?.trim()) continue;
    const existeEnBD = db.productos.some((p) => matchNombre(p.nombre, row.Nombre));
    const advertencias: string[] = [];
    if (!row.Categoría?.trim()) advertencias.push('Categoría vacía');
    if (!row.Presentación || row.Presentación <= 0) advertencias.push('Presentación inválida');
    if (row.Precio < 0) advertencias.push('Precio negativo');

    filas.push({
      indice: idx++, hoja: 'Productos',
      descripcion: `${row.Nombre.trim()} — ${row.Presentación} ${row.Unidad} ($${row.Precio})`,
      estado: advertencias.length > 0 ? 'advertencia' : existeEnBD ? 'ok' : 'nuevo',
      detalle:
        advertencias.length > 0
          ? advertencias.join(' · ')
          : existeEnBD
          ? 'Variante existente — se actualizará el precio'
          : 'Se creará el producto y su variante',
    });
  }

  // ── Productores ───────────────────────────────────────────────────────────
  for (const row of hojas.productores) {
    if (!row.Nombre?.trim()) continue;
    const existeEnBD = db.productores.some((p) => matchNombre(p.nombre, row.Nombre));
    const advertencias: string[] = [];

    for (const [campo, rol] of [
      ['Nombre Técnico', 'tecnico'],
      ['Nombre Coordinador', 'coordinador'],
      ['Nombre Gerente', 'gerente'],
    ] as const) {
      const nombreTec = row[campo as keyof typeof row] as string | undefined;
      if (!nombreTec?.trim()) continue;
      if (!tecnicoDisponible(nombreTec, rol)) {
        const candidatos = [
          ...db.tecnicos.filter((t) => t.rol === rol).map((t) => t.nombre),
          ...enArchivo.tecnicos.filter((t) => t.rol === rol).map((t) => t.nombre),
        ];
        const sugerencia = sugerirCercano(nombreTec, candidatos);
        advertencias.push(
          `${campo} "${nombreTec}" no encontrado${sugerencia ? ` — ¿quisiste decir "${sugerencia}"?` : ''}`
        );
      }
    }

    filas.push({
      indice: idx++, hoja: 'Productores',
      descripcion: row.Nombre.trim(),
      estado: advertencias.length > 0 ? 'advertencia' : existeEnBD ? 'ok' : 'nuevo',
      detalle:
        advertencias.length > 0
          ? advertencias.join(' · ')
          : existeEnBD
          ? 'Actualizará crédito y datos existentes'
          : 'Se creará nuevo productor',
    });
  }

  // ── Lotes ─────────────────────────────────────────────────────────────────
  for (const row of hojas.lotes) {
    if (!row['Nombre Productor']?.trim() || !row['Nombre Lote']?.trim()) continue;

    if (!productorDisponible(row['Nombre Productor'])) {
      const candidatos = [
        ...db.productores.map((p) => p.nombre),
        ...enArchivo.productores.map((p) => p.nombre),
      ];
      const sugerencia = sugerirCercano(row['Nombre Productor'], candidatos);
      filas.push({
        indice: idx++, hoja: 'Lotes',
        descripcion: `${row['Nombre Productor']} — ${row['Nombre Lote']}`,
        estado: 'error',
        detalle: `Productor "${row['Nombre Productor']}" no encontrado en BD ni en la hoja Productores${sugerencia ? ` — ¿quisiste decir "${sugerencia}"?` : ''}`,
      });
      continue;
    }

    // El productor existe (en BD o en el propio archivo) → lote es nuevo o actualización
    const prodEnBD = db.productores.find((p) => matchNombre(p.nombre, row['Nombre Productor']));
    const loteExisteEnBD = prodEnBD
      ? db.lotes.some((l) => l.productor_id === prodEnBD.id && matchNombre(l.nombre, row['Nombre Lote']))
      : false;

    filas.push({
      indice: idx++, hoja: 'Lotes',
      descripcion: `${row['Nombre Productor']} — ${row['Nombre Lote']} (${row['Hectáreas']} Ha)`,
      estado: loteExisteEnBD ? 'ok' : 'nuevo',
      detalle: loteExisteEnBD
        ? 'Actualizará las hectáreas del lote existente'
        : 'Se creará nuevo lote',
    });
  }

  // ── Plan ──────────────────────────────────────────────────────────────────
  const productoresUnicosPlan = new Set<string>();
  for (const row of hojas.plan) {
    if (!row['Nombre Productor']?.trim()) continue;
    const key = normalizar(row['Nombre Productor']);
    if (productoresUnicosPlan.has(key)) continue;
    productoresUnicosPlan.add(key);

    if (!productorDisponible(row['Nombre Productor'])) {
      const candidatos = [
        ...db.productores.map((p) => p.nombre),
        ...enArchivo.productores.map((p) => p.nombre),
      ];
      const sugerencia = sugerirCercano(row['Nombre Productor'], candidatos);
      filas.push({
        indice: idx++, hoja: 'Plan',
        descripcion: `Productor: ${row['Nombre Productor']}`,
        estado: 'error',
        detalle: `Productor no encontrado en BD ni en hoja Productores${sugerencia ? ` — ¿quisiste decir "${sugerencia}"?` : ''}. Sus productos de plan no se importarán.`,
      });
    } else {
      const count = hojas.plan.filter((r) =>
        matchNombre(r['Nombre Productor'], row['Nombre Productor'])
      ).length;
      // Advertir si algún producto del plan no está disponible
      const productosDelPlan = hojas.plan.filter((r) =>
        matchNombre(r['Nombre Productor'], row['Nombre Productor'])
      );
      const productosNoDisponibles = productosDelPlan.filter(
        (r) => r['Nombre Producto']?.trim() && !productoDisponible(r['Nombre Producto'])
      );
      filas.push({
        indice: idx++, hoja: 'Plan',
        descripcion: `Productor: ${row['Nombre Productor'].trim()}`,
        estado: productosNoDisponibles.length > 0 ? 'advertencia' : 'nuevo',
        detalle:
          productosNoDisponibles.length > 0
            ? `${count} productos — ${productosNoDisponibles.length} no encontrados en catálogo: se omitirán del plan`
            : `${count} productos en el plan — se importarán`,
      });
    }
  }

  return filas;
}

// ─── Importación real ────────────────────────────────────────────────────────

async function ejecutarImportacion(file: File): Promise<ResultadoImport> {
  const hojas = await parsearArchivo(file);
  const supabase = createSupabaseBrowserClient();
  const res: ResultadoImport = {
    tecnicos: 0, productos: 0, productores: 0, lotes: 0, planProductos: 0,
    errores: [], warnings: [],
  };

  // ── 1. Técnicos ───────────────────────────────────────────────────────────
  for (const row of hojas.tecnicos) {
    if (!row.Nombre?.trim() || !row.Rol?.trim()) continue;
    const { error: err } = await supabase.from('tecnicos').upsert(
      { nombre: row.Nombre.trim(), rol: row.Rol.trim().toLowerCase(), contacto: row.Contacto?.trim() ?? null },
      { onConflict: 'nombre,rol' }
    );
    if (err) res.errores.push(`Técnico "${row.Nombre}": ${err.message}`);
    else res.tecnicos++;
  }

  // Recargar técnicos
  const { data: tecnicosActuales } = await supabase.from('tecnicos').select('id, nombre, rol');

  const findTecnico = (nombre: string | undefined, rol: string): string | null => {
    if (!nombre?.trim()) return null;
    const found = tecnicosActuales?.find((t) => matchNombre(t.nombre, nombre) && t.rol === rol);
    if (!found) {
      const candidatos = (tecnicosActuales ?? []).filter((t) => t.rol === rol).map((t) => t.nombre);
      const sugerencia = sugerirCercano(nombre, candidatos);
      res.warnings.push(
        `${rol} "${nombre}" no encontrado — FK quedará vacío${sugerencia ? ` (¿quisiste decir "${sugerencia}"?)` : ''}`
      );
    }
    return found?.id ?? null;
  };

  // ── 2. Productos y variantes ──────────────────────────────────────────────
  for (const row of hojas.productos) {
    if (!row.Nombre?.trim() || !row.Categoría?.trim()) continue;

    // Proveedor (opcional)
    let proveedorId: string | null = null;
    if (row.Proveedor?.trim()) {
      let { data: prov } = await supabase
        .from('proveedores').select('id').ilike('nombre', row.Proveedor.trim()).maybeSingle();
      if (!prov) {
        const { data: np } = await supabase
          .from('proveedores').insert({ nombre: row.Proveedor.trim() }).select('id').single();
        prov = np;
      }
      proveedorId = prov?.id ?? null;
    }

    // Producto
    let { data: producto } = await supabase
      .from('productos').select('id').ilike('nombre', row.Nombre.trim()).maybeSingle();
    if (!producto) {
      const { data: np, error: npErr } = await supabase.from('productos').insert({
        nombre: row.Nombre.trim(),
        categoria: row.Categoría.trim(),
        subcategoria: row.Subcategoría?.trim() ?? null,
        proveedor_id: proveedorId,
      }).select('id').single();
      if (npErr) { res.errores.push(`Producto "${row.Nombre}": ${npErr.message}`); continue; }
      producto = np;
    }
    if (!producto) continue;

    // Variante (upsert por producto+presentacion+unidad)
    const { error: varErr } = await supabase.from('variantes_producto').upsert(
      {
        producto_id: producto.id,
        unidad: row.Unidad?.trim() ?? '',
        presentacion: row.Presentación,
        precio: row.Precio,
      },
      { onConflict: 'producto_id,presentacion,unidad' }
    );
    if (varErr) res.errores.push(`Variante "${row.Nombre}" ${row.Presentación}${row.Unidad}: ${varErr.message}`);
    else res.productos++;
  }

  // Recargar productos
  const { data: productosActuales } = await supabase.from('productos').select('id, nombre');

  // ── 3. Productores ────────────────────────────────────────────────────────
  for (const row of hojas.productores) {
    if (!row.Nombre?.trim()) continue;
    const { error: err } = await supabase.from('productores').upsert(
      {
        nombre: row.Nombre.trim(),
        banco: row.Banco?.trim() ?? null,
        credito_aprobado: row['Crédito Aprobado'] ?? 0,
        estado: row.Estado?.trim() ?? null,
        localidad: row.Localidad?.trim() ?? null,
        tecnico_id: findTecnico(row['Nombre Técnico'], 'tecnico'),
        coordinador_id: findTecnico(row['Nombre Coordinador'], 'coordinador'),
        gerente_id: findTecnico(row['Nombre Gerente'], 'gerente'),
      },
      { onConflict: 'nombre' }
    );
    if (err) res.errores.push(`Productor "${row.Nombre}": ${err.message}`);
    else res.productores++;
  }

  // Recargar productores
  const { data: productoresActuales } = await supabase.from('productores').select('id, nombre');

  const findProductor = (nombre: string): { id: string; nombre: string } | null => {
    const found = productoresActuales?.find((p) => matchNombre(p.nombre, nombre));
    if (!found) {
      const sugerencia = sugerirCercano(nombre, (productoresActuales ?? []).map((p) => p.nombre));
      res.errores.push(
        `Productor "${nombre}" no encontrado — fila saltada${sugerencia ? ` (¿quisiste decir "${sugerencia}"?)` : ''}`
      );
    }
    return found ?? null;
  };

  // ── 4. Lotes ──────────────────────────────────────────────────────────────
  for (const row of hojas.lotes) {
    if (!row['Nombre Productor']?.trim() || !row['Nombre Lote']?.trim()) continue;
    const prod = findProductor(row['Nombre Productor']);
    if (!prod) continue;

    const { error: err } = await supabase.from('lotes').upsert(
      {
        productor_id: prod.id,
        nombre: row['Nombre Lote'].trim(),
        hectareas: row['Hectáreas'] ?? 0,
        estado: row.Estado?.trim() ?? null,
      },
      { onConflict: 'productor_id,nombre' }
    );
    if (err) res.errores.push(`Lote "${row['Nombre Lote']}": ${err.message}`);
    else res.lotes++;
  }

  // Recargar lotes
  const { data: lotesActuales } = await supabase.from('lotes').select('id, nombre, productor_id');

  // ── 5. Plan ───────────────────────────────────────────────────────────────
  // Recargar variantes para buscar por producto+presentación
  const { data: variantesActuales } = await supabase
    .from('variantes_producto')
    .select('id, producto_id, presentacion, unidad, precio');

  // Mapa planId por productoId para no re-consultar
  const planCache = new Map<string, string>();

  const getOrCreatePlan = async (productorId: string): Promise<string | null> => {
    if (planCache.has(productorId)) return planCache.get(productorId)!;
    let { data: plan } = await supabase
      .from('planes').select('id').eq('productor_id', productorId).eq('ciclo', 2026).maybeSingle();
    if (!plan) {
      const { data: np } = await supabase
        .from('planes').insert({ productor_id: productorId, ciclo: 2026 }).select('id').single();
      plan = np;
    }
    if (plan) planCache.set(productorId, plan.id);
    return plan?.id ?? null;
  };

  for (const row of hojas.plan) {
    const nombreProductor = row['Nombre Productor']?.trim();
    const nombreProducto = row['Nombre Producto']?.trim();
    if (!nombreProductor || !nombreProducto) continue;

    const prod = findProductor(nombreProductor);
    if (!prod) continue;

    const planId = await getOrCreatePlan(prod.id);
    if (!planId) continue;

    // Resolver variante: buscar primero en catálogo (por nombre de producto)
    const productoMatch = productosActuales?.find((p) => matchNombre(p.nombre, nombreProducto));
    let varianteId: string | null = null;

    if (productoMatch) {
      // Buscar variante del plan por producto (tomar la primera disponible si hay una sola)
      const variantesDelProducto = (variantesActuales ?? []).filter(
        (v) => v.producto_id === productoMatch.id
      );
      if (variantesDelProducto.length === 1) {
        varianteId = variantesDelProducto[0].id;
      } else if (variantesDelProducto.length > 1) {
        // Si hay varias, tomar la primera — el usuario puede editar luego desde la UI
        varianteId = variantesDelProducto[0].id;
        res.warnings.push(
          `"${nombreProducto}" tiene ${variantesDelProducto.length} variantes — se asignó la primera. Revisá en la UI si es incorrecta.`
        );
      }
    }

    if (!varianteId) {
      // Producto no está en catálogo: crear producto + variante básica
      // (esto solo ocurre si no se usó la hoja Productos del mismo archivo)
      res.warnings.push(
        `Producto "${nombreProducto}" no encontrado en catálogo — se omitió del plan. Agrégalo primero en la hoja Productos.`
      );
      continue;
    }

    // Lote específico (si se indicó)
    let lotesIds: string[] | null = null;
    const nombreLote = row['Nombre Lote']?.trim();
    if (nombreLote) {
      const lote = lotesActuales?.find(
        (l) => l.productor_id === prod.id && matchNombre(l.nombre, nombreLote)
      );
      if (lote) {
        lotesIds = [lote.id];
      } else {
        res.warnings.push(
          `Lote "${nombreLote}" no encontrado para ${prod.nombre} — producto asignado a todos los lotes`
        );
      }
    }

    const { error: ppErr } = await supabase.from('plan_productos').insert({
      plan_id: planId, variante_id: varianteId,
      dosis_ha: row['Dosis/Ha'] ?? 0, lotes_ids: lotesIds,
    });
    if (ppErr) res.errores.push(`Plan "${nombreProducto}" (${prod.nombre}): ${ppErr.message}`);
    else res.planProductos++;
  }

  return res;
}

// ─── Componente ──────────────────────────────────────────────────────────────

const estadoConfig: Record<EstadoMatch, { icon: React.ElementType; color: string }> = {
  ok: { icon: CheckCircle, color: 'text-green-600' },
  nuevo: { icon: CheckCircle, color: 'text-blue-600' },
  advertencia: { icon: AlertTriangle, color: 'text-amber-600' },
  error: { icon: XCircle, color: 'text-rose-600' },
};

export default function ImportacionPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [fase, setFase] = useState<Fase>('inicial');
  const [archivoActual, setArchivoActual] = useState<File | null>(null);
  const [preview, setPreview] = useState<FilaValidada[]>([]);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [hojasExpandidas, setHojasExpandidas] = useState<Set<string>>(
    new Set(['Productores', 'Lotes', 'Plan'])
  );

  const handleExportarPlan = async () => {
    setExporting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const [productoresRes, lotesRes, planesRes] = await Promise.all([
        supabase.from('productores').select('id, nombre, banco, credito_aprobado, estado, localidad'),
        supabase.from('lotes').select('id, productor_id, nombre, hectareas'),
        supabase.from('planes').select(`
          id, productor_id, ciclo,
          plan_productos(id, dosis_ha, lotes_ids, precio_override, hectareas,
            variante:variantes_producto(id, unidad, presentacion, precio,
              producto:productos(id, nombre, categoria, subcategoria,
                proveedor:proveedores(id, nombre)
              )
            )
          )
        `),
      ]);
      const { exportarPlanExcel } = await import('@/lib/export');
      await exportarPlanExcel({
        productores: (productoresRes.data ?? []) as unknown as Parameters<typeof exportarPlanExcel>[0]['productores'],
        lotes: (lotesRes.data ?? []) as unknown as Parameters<typeof exportarPlanExcel>[0]['lotes'],
        planes: (planesRes.data ?? []) as unknown as Parameters<typeof exportarPlanExcel>[0]['planes'],
      });
    } finally {
      setExporting(false);
    }
  };

  const handleSeleccionarArchivo = useCallback(async (file: File) => {
    setErrorMsg('');
    setResultado(null);
    setLoading(true);
    setArchivoActual(file);

    try {
      const supabase = createSupabaseBrowserClient();
      const [tecRes, prodRes, prodActRes, lotesRes] = await Promise.all([
        supabase.from('tecnicos').select('id, nombre, rol'),
        supabase.from('productos').select('id, nombre'),
        supabase.from('productores').select('id, nombre'),
        supabase.from('lotes').select('id, nombre, productor_id'),
      ]);

      const db: DatosExistentes = {
        tecnicos: (tecRes.data ?? []) as DatosExistentes['tecnicos'],
        productos: (prodRes.data ?? []) as DatosExistentes['productos'],
        productores: (prodActRes.data ?? []) as DatosExistentes['productores'],
        lotes: (lotesRes.data ?? []) as DatosExistentes['lotes'],
      };

      const filas = await validarArchivo(file, db);
      setPreview(filas);
      setFase('preview');
    } catch (e) {
      setErrorMsg(`Error al leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleImportar = useCallback(async () => {
    if (!archivoActual) return;
    setFase('importando');
    setLoading(true);
    try {
      const res = await ejecutarImportacion(archivoActual);
      setResultado(res);
      setFase('resultado');
    } catch (e) {
      setErrorMsg(`Error durante la importación: ${e instanceof Error ? e.message : String(e)}`);
      setFase('preview');
    } finally {
      setLoading(false);
    }
  }, [archivoActual]);

  const toggleHoja = useCallback((hoja: string) => {
    setHojasExpandidas((prev) => {
      const next = new Set(prev);
      next.has(hoja) ? next.delete(hoja) : next.add(hoja);
      return next;
    });
  }, []);

  const resumenPreview = useMemo(() => ({
    ok: preview.filter((f) => f.estado === 'ok').length,
    nuevos: preview.filter((f) => f.estado === 'nuevo').length,
    advertencias: preview.filter((f) => f.estado === 'advertencia').length,
    errores: preview.filter((f) => f.estado === 'error').length,
  }), [preview]);

  const hojasPorNombre = useMemo(() => {
    const h: Record<string, FilaValidada[]> = {};
    for (const f of preview) {
      if (!h[f.hoja]) h[f.hoja] = [];
      h[f.hoja].push(f);
    }
    return h;
  }, [preview]);

  const hayErrores = resumenPreview.errores > 0;

  // ── FASE: Preview ─────────────────────────────────────────────────────────
  if (fase === 'preview' || fase === 'importando') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Validación previa: {archivoActual?.name}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Revisá los resultados antes de confirmar la importación
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setFase('inicial'); setPreview([]); }}>
            Cancelar
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Actualizarán', count: resumenPreview.ok, color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
            { label: 'Se crearán', count: resumenPreview.nuevos, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
            { label: 'Advertencias', count: resumenPreview.advertencias, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
            { label: 'Errores', count: resumenPreview.errores, color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' },
          ].map((item) => (
            <div key={item.label} className={['rounded-lg border p-3', item.bg].join(' ')}>
              <p className={['text-2xl font-bold', item.color].join(' ')}>{item.count}</p>
              <p className={['text-xs font-medium', item.color].join(' ')}>{item.label}</p>
            </div>
          ))}
        </div>

        {hayErrores && (
          <Alert variant="error" title="Algunas filas tienen errores y se saltarán">
            Los errores son referencias que no se encontraron ni en la BD ni en el propio archivo.
            Corregí el Excel y volvé a subirlo, o podés continuar y esas filas se omitirán.
          </Alert>
        )}

        {resumenPreview.advertencias > 0 && (
          <Alert variant="warning">
            Las advertencias no bloquean la importación. Las filas igual se importarán —
            revisá los detalles para decidir si necesitás corregir algo.
          </Alert>
        )}

        <div className="space-y-2">
          {Object.entries(hojasPorNombre).map(([hoja, filas]) => {
            const isExpanded = hojasExpandidas.has(hoja);
            const tieneProblemas = filas.some((f) => f.estado === 'error' || f.estado === 'advertencia');
            return (
              <Card key={hoja}>
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                  onClick={() => toggleHoja(hoja)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded
                      ? <ChevronDown size={16} className="text-slate-400" />
                      : <ChevronRight size={16} className="text-slate-400" />}
                    <span className="text-sm font-semibold text-slate-900">{hoja}</span>
                    <span className="text-xs text-slate-400">({filas.length} filas)</span>
                    {tieneProblemas && <Badge variant="yellow">Revisar</Badge>}
                  </div>
                  <div className="flex gap-3 text-xs">
                    {(['ok', 'nuevo', 'advertencia', 'error'] as const).map((e) => {
                      const n = filas.filter((f) => f.estado === e).length;
                      if (!n) return null;
                      const colors = { ok: 'text-green-600', nuevo: 'text-blue-600', advertencia: 'text-amber-600', error: 'text-rose-600' };
                      const labels = { ok: 'actualizan', nuevo: 'nuevos', advertencia: 'advertencia', error: 'errores' };
                      return <span key={e} className={colors[e]}>{n} {labels[e]}</span>;
                    })}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {filas.map((fila) => {
                      const { icon: Icon, color } = estadoConfig[fila.estado];
                      return (
                        <div key={fila.indice} className="flex items-start gap-3 px-4 py-2.5">
                          <Icon size={15} className={['shrink-0 mt-0.5', color].join(' ')} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-900">{fila.descripcion}</p>
                            <p className={['text-xs mt-0.5', color].join(' ')}>{fila.detalle}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={() => { setFase('inicial'); setPreview([]); }}>
            Volver y corregir
          </Button>
          <Button onClick={handleImportar} loading={fase === 'importando'}>
            {fase === 'importando'
              ? 'Importando...'
              : `Confirmar importación (${preview.filter((f) => f.estado !== 'error').length} filas)`}
          </Button>
        </div>
      </div>
    );
  }

  // ── FASE: Resultado ───────────────────────────────────────────────────────
  if (fase === 'resultado' && resultado) {
    const tieneProblemas = resultado.errores.length > 0 || resultado.warnings.length > 0;
    return (
      <div className="space-y-4">
        <Alert
          variant={resultado.errores.length === 0 ? 'success' : 'warning'}
          title="Importación completada"
        >
          <ul className="list-disc list-inside space-y-0.5 mt-1 text-sm">
            <li>{resultado.tecnicos} técnicos</li>
            <li>{resultado.productos} productos / variantes</li>
            <li>{resultado.productores} productores</li>
            <li>{resultado.lotes} lotes</li>
            <li>{resultado.planProductos} ítems de plan</li>
          </ul>
        </Alert>

        {resultado.warnings.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                <AlertTriangle size={15} />
                Advertencias ({resultado.warnings.length})
              </h3>
            </CardHeader>
            <CardBody className="max-h-48 overflow-y-auto space-y-1">
              {resultado.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-800">{w}</p>
              ))}
            </CardBody>
          </Card>
        )}

        {resultado.errores.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-rose-700 flex items-center gap-2">
                <XCircle size={15} />
                Errores ({resultado.errores.length}) — estas filas no se importaron
              </h3>
            </CardHeader>
            <CardBody className="max-h-48 overflow-y-auto space-y-1">
              {resultado.errores.map((e, i) => (
                <p key={i} className="text-xs text-rose-700">{e}</p>
              ))}
            </CardBody>
          </Card>
        )}

        <div className="flex gap-3">
          <Button onClick={() => { setFase('inicial'); setResultado(null); setArchivoActual(null); }}>
            Nueva importación
          </Button>
          {tieneProblemas && (
            <Button variant="secondary" onClick={() => { setFase('inicial'); setResultado(null); }}>
              Corregir y reimportar
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── FASE: Inicial ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Download size={16} className="text-green-600" />
              Template de importación
            </h3>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-xs text-slate-500">
              Template Excel con 5 hojas: Técnicos, Productos, Productores, Lotes y Plan.
              El orden importa: completá de arriba hacia abajo.
            </p>
            <Button variant="secondary" size="sm" className="w-full" onClick={descargarTemplateImportacion}>
              <FileSpreadsheet size={14} />
              Descargar template
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Upload size={16} className="text-blue-600" />
              Cargar datos
            </h3>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-xs text-slate-500">
              El sistema valida el archivo antes de importar. Podés subir todas las hojas juntas
              en un solo archivo — se importan en el orden correcto automáticamente.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              loading={loading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} />
              {loading ? 'Analizando...' : 'Seleccionar archivo'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleSeleccionarArchivo(f);
                e.target.value = '';
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Download size={16} className="text-emerald-600" />
              Exportar plan
            </h3>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-xs text-slate-500">
              Descargá el estado actual del plan con redondeos y costos (formato Costos x Agricultor).
            </p>
            <Button variant="secondary" size="sm" className="w-full" loading={exporting} onClick={handleExportarPlan}>
              <FileSpreadsheet size={14} />
              Exportar plan 2026
            </Button>
          </CardBody>
        </Card>
      </div>

      {errorMsg && <Alert variant="error">{errorMsg}</Alert>}
    </div>
  );
}
