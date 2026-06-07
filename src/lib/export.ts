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

  const wbTecnicos = [
    { Nombre: 'Nicole Ramones', Rol: 'tecnico', Contacto: '0424-5126975' },
  ];
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
  const wbLotes = [
    { 'Nombre Productor': 'Angela Rosa Guedez Morales', 'Nombre Lote': 'L01 LOTE 1A', Hectáreas: 26.53, Estado: 'Portuguesa' },
  ];
  const wbPlan = [
    {
      'Nombre Productor': 'Angela Rosa Guedez Morales',
      'Nombre Lote': '',
      Proveedor: 'Agrinova',
      Producto: 'Dual gold',
      Categoría: '1. Insumos',
      Subcategoría: 'Agroq. /Bio. /Mej.',
      Presentación: 1,
      Unidad: 'lt',
      Precio: 22.96,
      'Dosis/Ha': 1,
    },
  ];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.json_to_sheet(wbTecnicos), 'Técnicos');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbProductores), 'Productores');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbLotes), 'Lotes');
  utils.book_append_sheet(wb, utils.json_to_sheet(wbPlan), 'Plan');
  writeFile(wb, 'template_mini_grain.xlsx');
}
