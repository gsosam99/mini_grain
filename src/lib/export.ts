import type { Productor, Lote, Plan, PlanProducto } from '@/types';
import { calcularRedondeo } from './rounding';

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

    for (const pp of plan.plan_productos as PlanProducto[]) {
      if (!pp.variante?.producto) continue;
      const aplicables = pp.lotes_ids
        ? productorLotes.filter((l) => pp.lotes_ids!.includes(l.id))
        : productorLotes;
      const ha = aplicables.reduce((s, l) => s + l.hectareas, 0);
      const { totalSinRedondear, unidadesNecesarias, costoTotal } = calcularRedondeo({
        dosisHa: pp.dosis_ha,
        hectareas: ha,
        presentacion: pp.variante.presentacion,
        precio: pp.variante.precio,
      });

      costoRows.push({
        Productor: productor.nombre,
        Estado: productor.estado ?? '',
        Banco: productor.banco ?? '',
        Categoría: pp.variante.producto.categoria,
        Subcategoría: pp.variante.producto.subcategoria ?? '',
        Proveedor: (pp.variante.producto as { proveedor?: { nombre: string } }).proveedor?.nombre ?? '',
        Producto: pp.variante.producto.nombre,
        'Precio Unitario': pp.variante.precio,
        'Dosis/Ha': pp.dosis_ha,
        'Ha Aplicables': ha,
        'Total sin redondear': totalSinRedondear,
        Presentación: pp.variante.presentacion,
        Unidad: pp.variante.unidad,
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

  // Hoja 1: Técnicos
  const wbTecnicos = [
    { Nombre: 'Nicole Ramones', Rol: 'tecnico', Contacto: '0424-5126975' },
    { Nombre: 'Franklin Luis', Rol: 'coordinador', Contacto: '0412-3456789' },
    { Nombre: 'Hilda Alejua', Rol: 'gerente', Contacto: '0416-9876543' },
  ];

  // Hoja 2: Productos — una fila por variante (presentación)
  // El mismo producto puede aparecer varias veces con distintas presentaciones
  const wbProductos = [
    { Proveedor: 'Agrinova', Nombre: 'Dual gold', Categoría: '1. Insumos', Subcategoría: 'Agroq. /Bio. /Mej.', Presentación: 1, Unidad: 'lt', Precio: 22.96 },
    { Proveedor: 'Agrinova', Nombre: 'Dual gold', Categoría: '1. Insumos', Subcategoría: 'Agroq. /Bio. /Mej.', Presentación: 5, Unidad: 'lt', Precio: 110.00 },
    { Proveedor: 'Agrinova', Nombre: 'Dual gold', Categoría: '1. Insumos', Subcategoría: 'Agroq. /Bio. /Mej.', Presentación: 20, Unidad: 'lt', Precio: 420.00 },
    { Proveedor: 'Syngenta', Nombre: 'Karate Zeon', Categoría: '1. Insumos', Subcategoría: 'Agroq. /Bio. /Mej.', Presentación: 1, Unidad: 'lt', Precio: 35.00 },
    { Proveedor: 'Fertiagro', Nombre: 'Urea granulada', Categoría: '1. Insumos', Subcategoría: 'Fertilizante Básico: Fórmula', Presentación: 50, Unidad: 'kg', Precio: 48.50 },
  ];

  // Hoja 3: Productores
  const wbProductores = [
    {
      Nombre: 'Angela Rosa Guedez Morales',
      Banco: 'Mercantil',
      'Crédito Aprobado': 50000,
      Estado: 'Portuguesa',
      Localidad: 'Turén',
      'Nombre Técnico': 'Nicole Ramones',
      'Nombre Coordinador': 'Franklin Luis',
      'Nombre Gerente': 'Hilda Alejua',
    },
  ];

  // Hoja 4: Lotes
  const wbLotes = [
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': 'L01 LOTE 1A', Hectáreas: 26.53, Estado: 'Portuguesa' },
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': 'L02 LOTE 2B', Hectáreas: 14.00, Estado: 'Portuguesa' },
  ];

  // Hoja 5: Plan — una fila por producto por productor
  // Nombre Lote vacío = aplica a todos los lotes del productor
  const wbPlan = [
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': '', 'Nombre Producto': 'Dual gold', 'Dosis/Ha': 1 },
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': '', 'Nombre Producto': 'Urea granulada', 'Dosis/Ha': 2.5 },
    // Ejemplo con lote específico (cal u otro producto focalizado):
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': 'L01 LOTE 1A', 'Nombre Producto': 'Karate Zeon', 'Dosis/Ha': 0.5 },
  ];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.json_to_sheet(wbTecnicos), 'Técnicos');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbProductos), 'Productos');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbProductores), 'Productores');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbLotes), 'Lotes');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbPlan), 'Plan');
  writeFile(wb, 'template_mini_grain.xlsx');
}
