'use client';

import { useState, useRef } from 'react';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { Download, Upload, FileSpreadsheet } from 'lucide-react';
import { descargarTemplateImportacion } from '@/lib/export';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface ResultadoImport {
  tecnicos: number;
  productores: number;
  lotes: number;
  planProductos: number;
  errores: string[];
}

export default function ImportacionPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [error, setError] = useState('');

  const handleExportarPlan = async () => {
    setExporting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const [productoresRes, lotesRes, planesRes] = await Promise.all([
        supabase.from('productores').select('id, nombre, banco, credito_aprobado, estado, localidad'),
        supabase.from('lotes').select('id, productor_id, nombre, hectareas'),
        supabase.from('planes').select(`
          id, productor_id, ciclo,
          plan_productos(
            id, dosis_ha, lotes_ids,
            variante:variantes_producto(
              id, unidad, presentacion, precio,
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

  const handleImportar = async (file: File) => {
    setLoading(true);
    setError('');
    setResultado(null);

    try {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: 'array' });

      const supabase = createSupabaseBrowserClient();
      const res: ResultadoImport = { tecnicos: 0, productores: 0, lotes: 0, planProductos: 0, errores: [] };

      // --- Técnicos ---
      const wsTec = wb.Sheets['Técnicos'];
      if (wsTec) {
        const rows = utils.sheet_to_json<{ Nombre: string; Rol: string; Contacto?: string }>(wsTec);
        for (const row of rows) {
          if (!row.Nombre || !row.Rol) continue;
          const { error: err } = await supabase.from('tecnicos').upsert(
            { nombre: row.Nombre, rol: row.Rol.toLowerCase(), contacto: row.Contacto ?? null },
            { onConflict: 'nombre,rol' }
          );
          if (err) res.errores.push(`Técnico ${row.Nombre}: ${err.message}`);
          else res.tecnicos++;
        }
      }

      // --- Productores ---
      const wsProd = wb.Sheets['Productores'];
      if (wsProd) {
        const rows = utils.sheet_to_json<{
          Nombre: string; Banco?: string; 'Crédito Aprobado'?: number;
          Estado?: string; Localidad?: string;
          'Nombre Técnico'?: string; 'Nombre Coordinador'?: string; 'Nombre Gerente'?: string;
        }>(wsProd);

        const { data: tecnicos } = await supabase.from('tecnicos').select('id, nombre, rol');

        const findTecnico = (nombre: string | undefined, rol: string) =>
          tecnicos?.find((t) => t.nombre === nombre && t.rol === rol)?.id ?? null;

        for (const row of rows) {
          if (!row.Nombre) continue;
          const { error: err } = await supabase.from('productores').upsert(
            {
              nombre: row.Nombre,
              banco: row.Banco ?? null,
              credito_aprobado: row['Crédito Aprobado'] ?? 0,
              estado: row.Estado ?? null,
              localidad: row.Localidad ?? null,
              tecnico_id: findTecnico(row['Nombre Técnico'], 'tecnico'),
              coordinador_id: findTecnico(row['Nombre Coordinador'], 'coordinador'),
              gerente_id: findTecnico(row['Nombre Gerente'], 'gerente'),
            },
            { onConflict: 'nombre' }
          );
          if (err) res.errores.push(`Productor ${row.Nombre}: ${err.message}`);
          else res.productores++;
        }
      }

      // --- Lotes ---
      const wsLotes = wb.Sheets['Lotes'];
      if (wsLotes) {
        const rows = utils.sheet_to_json<{
          'Nombre Productor': string; 'Nombre Lote': string; Hectáreas: number; Estado?: string;
        }>(wsLotes);
        const { data: productores } = await supabase.from('productores').select('id, nombre');

        for (const row of rows) {
          if (!row['Nombre Productor'] || !row['Nombre Lote']) continue;
          const prod = productores?.find((p) => p.nombre === row['Nombre Productor']);
          if (!prod) { res.errores.push(`Productor no encontrado: ${row['Nombre Productor']}`); continue; }

          const { error: err } = await supabase.from('lotes').upsert(
            {
              productor_id: prod.id,
              nombre: row['Nombre Lote'],
              hectareas: row['Hectáreas'] ?? 0,
              estado: row.Estado ?? null,
            },
            { onConflict: 'productor_id,nombre' }
          );
          if (err) res.errores.push(`Lote ${row['Nombre Lote']}: ${err.message}`);
          else res.lotes++;
        }
      }

      // --- Plan ---
      const wsPlan = wb.Sheets['Plan'];
      if (wsPlan) {
        const rows = utils.sheet_to_json<{
          'Nombre Productor': string; 'Nombre Lote'?: string;
          Proveedor?: string; Producto: string; Categoría: string; Subcategoría?: string;
          Presentación: number; Unidad: string; Precio: number; 'Dosis/Ha': number;
        }>(wsPlan);

        const { data: productores } = await supabase.from('productores').select('id, nombre');
        const { data: lotes } = await supabase.from('lotes').select('id, nombre, productor_id');

        for (const row of rows) {
          if (!row['Nombre Productor'] || !row.Producto) continue;
          const prod = productores?.find((p) => p.nombre === row['Nombre Productor']);
          if (!prod) { res.errores.push(`Productor plan: ${row['Nombre Productor']}`); continue; }

          let { data: plan } = await supabase
            .from('planes')
            .select('id')
            .eq('productor_id', prod.id)
            .eq('ciclo', 2026)
            .maybeSingle();

          if (!plan) {
            const { data: newPlan } = await supabase
              .from('planes')
              .insert({ productor_id: prod.id, ciclo: 2026 })
              .select('id')
              .single();
            plan = newPlan;
          }

          if (!plan) continue;

          let { data: proveedor } = await supabase
            .from('proveedores')
            .select('id')
            .eq('nombre', row.Proveedor ?? '')
            .maybeSingle();

          if (!proveedor && row.Proveedor) {
            const { data: np } = await supabase
              .from('proveedores')
              .insert({ nombre: row.Proveedor })
              .select('id')
              .single();
            proveedor = np;
          }

          let { data: producto } = await supabase
            .from('productos')
            .select('id')
            .eq('nombre', row.Producto)
            .maybeSingle();

          if (!producto) {
            const { data: np } = await supabase
              .from('productos')
              .insert({
                nombre: row.Producto,
                categoria: row.Categoría,
                subcategoria: row.Subcategoría ?? null,
                proveedor_id: proveedor?.id ?? null,
              })
              .select('id')
              .single();
            producto = np;
          }

          if (!producto) continue;

          let { data: variante } = await supabase
            .from('variantes_producto')
            .select('id')
            .eq('producto_id', producto.id)
            .eq('presentacion', row.Presentación)
            .eq('unidad', row.Unidad)
            .maybeSingle();

          if (!variante) {
            const { data: nv } = await supabase
              .from('variantes_producto')
              .insert({
                producto_id: producto.id,
                unidad: row.Unidad,
                presentacion: row.Presentación,
                precio: row.Precio,
              })
              .select('id')
              .single();
            variante = nv;
          }

          if (!variante) continue;

          let lotesIds: string[] | null = null;
          if (row['Nombre Lote']) {
            const lote = lotes?.find(
              (l) => l.nombre === row['Nombre Lote'] && l.productor_id === prod.id
            );
            if (lote) lotesIds = [lote.id];
          }

          const { error: ppErr } = await supabase.from('plan_productos').insert({
            plan_id: plan.id,
            variante_id: variante.id,
            dosis_ha: row['Dosis/Ha'],
            lotes_ids: lotesIds,
          });

          if (ppErr) res.errores.push(`Plan producto ${row.Producto}: ${ppErr.message}`);
          else res.planProductos++;
        }
      }

      setResultado(res);
    } catch (e) {
      setError(`Error al procesar el archivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
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
              Descargá el template Excel con las hojas: Técnicos, Productores, Lotes y Plan. Completá los datos y subí el archivo.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={descargarTemplateImportacion}
            >
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
              Subí el template completado. Se crearán o actualizarán técnicos, productores, lotes y el plan.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              loading={loading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} />
              {loading ? 'Importando...' : 'Seleccionar archivo'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportar(f);
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
              Descargá el estado actual del plan con redondeos y costos en formato Excel (Costos x Agricultor).
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              loading={exporting}
              onClick={handleExportarPlan}
            >
              <FileSpreadsheet size={14} />
              Exportar plan 2026
            </Button>
          </CardBody>
        </Card>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {resultado && (
        <Alert variant={resultado.errores.length === 0 ? 'success' : 'warning'} title="Resultado de la importación">
          <ul className="list-disc list-inside space-y-0.5 text-sm">
            <li>{resultado.tecnicos} técnicos importados</li>
            <li>{resultado.productores} productores importados</li>
            <li>{resultado.lotes} lotes importados</li>
            <li>{resultado.planProductos} ítems de plan importados</li>
          </ul>
          {resultado.errores.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto">
              {resultado.errores.map((e, i) => (
                <p key={i} className="text-xs text-amber-800">{e}</p>
              ))}
            </div>
          )}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Formato del template</h3>
        </CardHeader>
        <CardBody>
          <div className="space-y-4 text-xs text-slate-600">
            <div>
              <p className="font-semibold text-slate-800 mb-1">Hoja: Técnicos</p>
              <p className="font-mono bg-slate-50 px-2 py-1 rounded">Nombre | Rol (tecnico/coordinador/gerente) | Contacto</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800 mb-1">Hoja: Productores</p>
              <p className="font-mono bg-slate-50 px-2 py-1 rounded">Nombre | Banco | Crédito Aprobado | Estado | Localidad | Nombre Técnico | Nombre Coordinador | Nombre Gerente</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800 mb-1">Hoja: Lotes</p>
              <p className="font-mono bg-slate-50 px-2 py-1 rounded">Nombre Productor | Nombre Lote | Hectáreas | Estado</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800 mb-1">Hoja: Plan</p>
              <p className="font-mono bg-slate-50 px-2 py-1 rounded">Nombre Productor | Nombre Lote (vacío=todos) | Proveedor | Producto | Categoría | Subcategoría | Presentación | Unidad | Precio | Dosis/Ha</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
