import type { Productor, Lote, Plan, PlanProducto } from '@/types';
import { calcularRedondeoAgregado, esServicio } from './rounding';

export async function exportarPlanExcel(params: {
  productores: Productor[];
  lotes: Lote[];
  planes: Plan[];
}) {
  const { utils, writeFile } = await import('xlsx');

  const { productores, lotes, planes } = params;

  const costoRows: Record<string, string | number>[] = [];

  for (const productor of productores) {
    const productorLotes = lotes.filter((l) => l.productor_id === productor.id);
    const plan = planes.find((p) => p.productor_id === productor.id);
    if (!plan?.plan_productos) continue;

    // Agrupar por variante para aplicar UN SOLO ceil por variante
    const varMap = new Map<string, PlanProducto[]>();
    for (const pp of plan.plan_productos as PlanProducto[]) {
      if (!pp.variante?.producto) continue;
      const vid = pp.variante.id;
      if (!varMap.has(vid)) varMap.set(vid, []);
      varMap.get(vid)!.push(pp);
    }

    for (const [, varPps] of varMap) {
      const pp0 = varPps[0];
      if (!pp0.variante?.producto) continue;

      const aplicacionesAgg = varPps.map((pp) => {
        const aplicables = pp.lotes_ids
          ? productorLotes.filter((l) => pp.lotes_ids!.includes(l.id))
          : productorLotes;
        const hectareas = pp.hectareas ?? aplicables.reduce((s, l) => s + l.hectareas, 0);
        return { dosisHa: pp.dosis_ha, hectareas, precioOverride: pp.precio_override };
      });

      const { totalSinRedondear, unidadesNecesarias, costoTotal } = calcularRedondeoAgregado({
        aplicaciones: aplicacionesAgg,
        presentacion: pp0.variante.presentacion,
        precio: pp0.variante.precio,
        redondear: !esServicio(pp0.variante.unidad),
      });

      const haTotal = aplicacionesAgg.reduce((s, a) => s + a.hectareas, 0);

      costoRows.push({
        Productor: productor.nombre,
        Estado: productor.estado ?? '',
        Banco: productor.banco ?? '',
        Categoría: pp0.variante.producto.categoria,
        Subcategoría: pp0.variante.producto.subcategoria ?? '',
        Proveedor: (pp0.variante.producto as { proveedor?: { nombre: string } }).proveedor?.nombre ?? '',
        Producto: pp0.variante.producto.nombre,
        'Precio Unitario': pp0.variante.precio,
        'Ha Aplicables': haTotal,
        'Total sin redondear': totalSinRedondear,
        Presentación: pp0.variante.presentacion,
        Unidad: pp0.variante.unidad,
        'Redondeo Final': unidadesNecesarias,
        'Costo Total': costoTotal,
      });
    }
  }

  const wb = utils.book_new();
  const ws = utils.json_to_sheet(costoRows);
  utils.book_append_sheet(wb, ws, 'Costos x Agricultor');
  writeFile(wb, `plan_agricola_2026_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function descargarTemplateImportacion() {
  const { utils, writeFile } = await import('xlsx');

  // ── Hoja 0: Instrucciones ───────────────────────────────────────────────
  // Documenta el CONVENIO de carga para que el costo se calcule bien.
  // El costo de mini grain es: ceil( Σ(Dosis/Ha × Ha) / Presentación ) × Precio
  // por lo que Precio y Presentación deben respetar estas reglas:
  const wbInstrucciones = [
    { Campo: 'REGLA GENERAL', Detalle: 'Precio = precio del EMPAQUE completo (no por litro/kg suelto). Presentación = tamaño del empaque, en la MISMA unidad en que se expresa la Dosis/Ha del plan.' },
    { Campo: 'Agroquímicos (L / kg / g)', Detalle: 'Dosis/Ha en litros o kg. Presentación = tamaño del envase en esa unidad (ej. bidón 5L → 5). Precio = precio del envase completo (ej. bidón 5L de Gadriano = $82,10, NO $16,42/L).' },
    { Campo: 'Fertilizantes y semillas (saco / bolsa)', Detalle: 'Dosis/Ha en sacos o bolsas. Presentación = 1. Precio = precio por saco/bolsa (ej. Fert Base = $35,83/saco).' },
    { Campo: 'Servicios (análisis, fletes, asistencia)', Detalle: 'Presentación = 1, Unidad = servicio. Precio = precio por servicio/aplicación.' },
    { Campo: 'Columna Categoría', Detalle: 'Poné la subcategoría real (ej. "Agroq. /Bio. /Mej.", "Fertilizante Básico: Fórmula", "Semillas de Maíz", "Tecnología & Asistencia Técnica"). El nivel superior (Insumos / Mecanización / Costo Financiero) lo agrupa la app automáticamente.' },
    { Campo: 'Columna Subcategoría', Detalle: 'Opcional. Dejar vacía salvo que se necesite un sub-nivel adicional.' },
    { Campo: 'Variantes del mismo producto', Detalle: 'Repetí el mismo Nombre en varias filas con distinta Presentación/Precio (ej. bidón 1L y bidón 20L). Se cargan como variantes del mismo producto.' },
    { Campo: 'Productor con varios bancos', Detalle: 'Si un productor tiene crédito en más de un banco, agregá una fila por banco en la hoja Productores (mismo Nombre, distinto Banco y Crédito Aprobado).' },
  ];

  // ── Hoja 1: Técnicos ────────────────────────────────────────────────────
  const wbTecnicos = [
    { Nombre: 'Nicole Ramones', Rol: 'tecnico', Contacto: '0424-5126975' },
    { Nombre: 'Franklin Luis', Rol: 'coordinador', Contacto: '0412-3456789' },
    { Nombre: 'Hilda Alejua', Rol: 'gerente', Contacto: '0416-9876543' },
  ];

  // ── Hoja 2: Productos ─────────────────────────────────────────────────────
  // Una fila por variante. Categoría = subcategoría real; Precio = por empaque.
  const wbProductos = [
    // Agroquímico con 2 presentaciones (precio POR ENVASE, presentación en litros):
    { Proveedor: 'Agrinova', Nombre: 'Dual gold', Categoría: 'Agroq. /Bio. /Mej.', Subcategoría: '', Presentación: 1, Unidad: 'L', Precio: 22.96 },
    { Proveedor: 'Agrinova', Nombre: 'Dual gold', Categoría: 'Agroq. /Bio. /Mej.', Subcategoría: '', Presentación: 5, Unidad: 'L', Precio: 114.80 },
    // Fertilizante: dosis en sacos → presentación 1, precio por saco:
    { Proveedor: 'Agropaca', Nombre: 'Fert Base 1: MAS MAIZ 5 tn', Categoría: 'Fertilizante Básico: Fórmula', Subcategoría: '', Presentación: 1, Unidad: 'saco', Precio: 35.83 },
    // Semilla: dosis en bolsas → presentación 1, precio por bolsa:
    { Proveedor: 'Provencesa', Nombre: 'Maíz: Danac-029 c/fortenza duo', Categoría: 'Semillas de Maíz', Subcategoría: '', Presentación: 1, Unidad: 'saco', Precio: 177.00 },
    // Servicio:
    { Proveedor: 'Edafofinca', Nombre: 'Análisis de agua', Categoría: 'Tecnología & Asistencia Técnica', Subcategoría: '', Presentación: 1, Unidad: 'servicio', Precio: 3.50 },
  ];

  // ── Hoja 3: Productores ───────────────────────────────────────────────────
  // Un productor con dos bancos = dos filas (mismo Nombre, distinto Banco/Crédito).
  const wbProductores = [
    {
      Nombre: 'Angela Rosa Guedez Morales',
      Banco: 'Provincial',
      'Crédito Aprobado': 267234.64,
      Estado: 'Portuguesa',
      Localidad: 'Turén',
      'Nombre Técnico': 'Nicole Ramones',
      'Nombre Coordinador': 'Franklin Luis',
      'Nombre Gerente': 'Hilda Alejua',
    },
    // Ejemplo de productor con crédito en dos bancos:
    {
      Nombre: 'Juan Vicente Risso',
      Banco: 'Provincial',
      'Crédito Aprobado': 300000,
      Estado: 'Guárico',
      Localidad: 'Las Mercedes',
      'Nombre Técnico': 'Jesus David Sanchez Hernandez',
      'Nombre Coordinador': '',
      'Nombre Gerente': 'Hilda Alejua',
    },
    {
      Nombre: 'Juan Vicente Risso',
      Banco: 'Mercantil',
      'Crédito Aprobado': 265233.01,
      Estado: 'Guárico',
      Localidad: 'Las Mercedes',
      'Nombre Técnico': 'Jesus David Sanchez Hernandez',
      'Nombre Coordinador': '',
      'Nombre Gerente': 'Hilda Alejua',
    },
  ];

  // ── Hoja 4: Lotes ─────────────────────────────────────────────────────────
  const wbLotes = [
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': 'LOTE 1A', Hectáreas: 26.53, Región: 'Turén' },
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': 'LOTE 1B', Hectáreas: 33.30, Región: 'Turén' },
  ];

  // ── Hoja 5: Plan ──────────────────────────────────────────────────────────
  // Nombre Lote vacío = aplica a todos los lotes del productor.
  // Dosis/Ha en la MISMA unidad que la presentación del producto.
  const wbPlan = [
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': '', 'Nombre Producto': 'Dual gold', 'Dosis/Ha': 2 },
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': '', 'Nombre Producto': 'Fert Base 1: MAS MAIZ 5 tn', 'Dosis/Ha': 8 },
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': 'LOTE 1A', 'Nombre Producto': 'Análisis de agua', 'Dosis/Ha': 1 },
  ];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.json_to_sheet(wbInstrucciones), 'Instrucciones');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbTecnicos), 'Técnicos');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbProductos), 'Productos');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbProductores), 'Productores');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbLotes), 'Lotes');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbPlan), 'Plan');
  writeFile(wb, 'template_mini_grain.xlsx');
}
