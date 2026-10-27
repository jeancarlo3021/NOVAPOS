import React, { useState, useRef } from 'react';
import {
  X, Upload, Download, AlertCircle, CheckCircle2, Loader2, FileSpreadsheet, Trash2,
} from 'lucide-react';
import { createProduct, categoriesService, unitTypesService } from '@/services/Inventory/InventoryProductsService';
import { apiFetch } from '@/lib/api';
import { BULK_CHUNK_SIZE, chunked, mapWithConcurrency } from '@/utils/bulkChunks';

interface Props {
  tenantId: string;
  onClose: () => void;
  onDone: (createdCount: number) => void;
  /** Modo panel admin: importa para OTRO tenant vía endpoint admin (server-side). */
  adminMode?: boolean;
}

interface ParsedRow {
  /** El CABYS no venía en el archivo: se tomó del producto que ya existe. */
  _cabys_heredado?: boolean;
  /** Cómo se le puso el CABYS: a mano para todas, o sugerido por el catálogo. */
  _cabys_asignado?: 'manual' | 'sugerido';
  /** Descripción del CABYS del catálogo, para poder revisar la sugerencia. */
  _cabys_desc?: string;
  /** De dónde salió la sugerencia (otro negocio o el catálogo). */
  _cabys_origen?: string;
  /** Por qué se eligió ese código, en una frase revisable de un vistazo. */
  _cabys_motivo?: string;
  /** Las otras opciones razonables, para poder corregir sin salir a buscar. */
  _cabys_alternativas?: Array<{ code: string; description: string; iva_rate: number | null; coincidencia: number }>;
  name: string;
  sku?: string;
  sku2?: string;
  description?: string;
  supplier?: string;     // nombre, se resuelve/crea en la tabla suppliers
  unit_price: number;
  cost_price?: number;
  tracks_stock?: boolean;
  stock_quantity?: number;
  min_stock_level?: number;
  max_stock_level?: number;
  cabys_code?: string;
  iva_rate?: number;
  category?: string;     // nombre, se resuelve a id
  unit_type?: string;    // nombre o abreviación, se resuelve a id
  _error?: string;
  /** Aviso no bloqueante: se importa igual, pero conviene revisarlo. */
  _warn?: string;
}

/**
 * Encabezado del archivo → columna del sistema.
 *
 * La clienta arma el Excel con los nombres que le salen naturales («Nombre»,
 * «Precio», «Costo»…), no con los del sistema. Si no se reconocen, la columna
 * queda sin mapear y los datos terminan corridos o vacíos — que es exactamente
 * lo que estaba pasando.
 */
const HEADER_ALIASES: Record<string, string> = {
  nombre: 'name', producto: 'name', descripcion_producto: 'name',
  codigo: 'sku', code: 'sku', barras: 'sku', codigo_barras: 'sku',
  codigo2: 'sku2', barras2: 'sku2',
  descripcion: 'description', detalle: 'description',
  proveedor: 'supplier',
  precio: 'unit_price', precio_venta: 'unit_price', venta: 'unit_price', pvp: 'unit_price',
  costo: 'cost_price', precio_costo: 'cost_price', compra: 'cost_price',
  stock: 'stock_quantity', existencias: 'stock_quantity', cantidad: 'stock_quantity',
  minimo: 'min_stock_level', stock_minimo: 'min_stock_level',
  maximo: 'max_stock_level', stock_maximo: 'max_stock_level',
  infinito: 'stock_infinito', sin_stock: 'stock_infinito',
  categoria: 'category', familia: 'category',
  // ── Nombres que traen los sistemas de punto de venta de acá ──────────────
  // Los catálogos que manda el cliente vienen exportados de su sistema viejo y
  // usan abreviaturas: «P. Venta», «Existencia», «Departamento». Sin estos
  // alias había que renombrar las columnas a mano antes de poder importar.
  p_venta: 'unit_price', p_costo: 'cost_price', p_mayoreo: 'wholesale_price',
  existencia: 'stock_quantity', inv_minimo: 'min_stock_level', inv_maximo: 'max_stock_level',
  departamento: 'category', linea: 'category', grupo: 'category',
  tipo_de_venta: 'unit_type', tipo_venta: 'unit_type',
  unidad: 'unit_type', unidad_medida: 'unit_type', medida: 'unit_type',
  cabys: 'cabys_code', codigo_cabys: 'cabys_code',
  iva: 'iva_rate', impuesto: 'iva_rate', tarifa: 'iva_rate',
};

/** Deja el encabezado comparable: sin tildes, sin espacios raros, en minúscula. */
function normalizeHeader(h: string): string {
  const clean = String(h ?? '')
    .replace(/\u00a0/g, ' ')                      // espacio duro de Excel
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // tildes
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')                  // espacios y signos → _
    .replace(/^_+|_+$/g, '');
  return HEADER_ALIASES[clean] ?? clean;
}

/** Limpia una celda: espacios normales, duros y comillas sueltas de Excel. */
function cleanCell(v: any): string {
  return String(v ?? '').replace(/\u00a0/g, ' ').trim().replace(/^"(.*)"$/s, '$1').trim();
}

const HEADERS = [
  'name', 'sku', 'sku2', 'description', 'supplier', 'unit_price', 'cost_price',
  'stock_infinito', 'stock_quantity', 'min_stock_level', 'max_stock_level',
  'category', 'unit_type', 'cabys_code', 'iva_rate',
];

// Plantilla con ';' — así Excel en español la divide en columnas al abrirla.
const TEMPLATE_CSV =
  HEADERS.join(';') + '\n' +
  'Café Americano;CAFE001;7501001;Café tradicional 8oz;Proveedor ABC;1500;800;No;100;10;200;Bebidas;Unidad;;13\n' +
  'Pan Tostado;PAN001;;Pan artesanal;Panificadora XYZ;800;400;No;50;5;100;Panadería;Unidad;;13\n' +
  'Servicio de limpieza;SERV01;;Sin control de stock;;5000;0;Sí;0;0;0;Servicios;Unidad;;13\n';

// ── Parser CSV (simple — soporta valores con comillas y comas escapadas) ──
// delim: ',' o ';' (Excel en español usa ';'). Se auto-detecta antes de llamar.
/**
 * Lector de CSV tolerante a comillas sueltas.
 *
 * ── Por qué no basta el CSV «de manual» ────────────────────────────────────
 * En el catálogo real las comillas aparecen como MEDIDA, no como delimitador:
 * «Cinta 1/2"», «Elástico 3/4"». Un lector estricto ve esa comilla, cree que
 * empieza un texto entrecomillado y se traga TODO el resto del archivo —miles de
 * filas— dentro de una sola celda. El usuario subía 5.600 productos y el sistema
 * le decía «1.000 válidos», sin ningún error: los otros 4.600 estaban ahí, pegados
 * dentro de un campo gigante.
 *
 * La regla acá: una comilla solo abre texto entrecomillado si está al PRINCIPIO
 * del campo, y solo lo cierra si después viene un separador, un salto de línea o
 * el final. En cualquier otro lugar es lo que parece: una pulgada.
 */
function parseCSV(text: string, delim: string = ','): string[][] {
  const rows: string[][] = [];
  let cur = '', row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') { cur += '"'; i++; }        // comilla escapada
      else if (inQuotes) {
        // Solo cierra si el campo termina acá. Si sigue texto, era una medida.
        const cierra = next === undefined || next === delim || next === '\n' || next === '\r';
        if (cierra) inQuotes = false;
        else cur += c;
      } else if (cur === '') {
        inQuotes = true;                                        // abre el campo
      } else {
        cur += c;                                               // 1/2" → pulgadas
      }
    } else if (c === delim && !inQuotes) {
      row.push(cur); cur = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
      cur = ''; row = [];
      if (c === '\r' && next === '\n') i++;
    } else {
      cur += c;
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

/** Miles con PUNTO: `toLocaleString('es-CR')` devuelve un espacio fino según
 *  el navegador —«₡1 200»— y no es como se escribe un monto en el resto del
 *  sistema. */
const miles = (n: number): string =>
  Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function num(v: string | undefined, def?: number): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return def;
  let s = String(v).trim();
  // Formato CR/europeo: la coma es decimal. "1.325,39" → miles con punto, decimal coma;
  // "1325,39" → coma decimal. "1325.39" → punto decimal (se deja).
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  s = s.replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? def : n;
}

export const BulkProductImportModal: React.FC<Props> = ({ tenantId, onClose, onDone, adminMode }) => {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  /**
   * ¿LOS PRECIOS DEL ARCHIVO YA TRAEN EL IMPUESTO?
   *
   * El sistema guarda el precio SIN impuesto y se lo suma al vender. Si el
   * archivo viene con el precio final —que es como lo tiene la mayoría, porque
   * es el que se le canta al cliente— importarlo tal cual sube todo el catálogo
   * un 13%: el negocio empieza a cobrar de más sin que nadie lo note hasta que
   * un cliente reclama.
   *
   * Al revés también: restarle el impuesto a un precio que no lo traía deja
   * todo un 13% barato y el margen se come la diferencia.
   *
   * Como no hay forma de adivinarlo mirando el archivo, SE PREGUNTA, y no se
   * deja importar hasta que esté contestado. `null` = sin contestar.
   */
  const [impuestoEnPrecio, setImpuestoEnPrecio] = useState<'incluido' | 'aparte' | null>(null);
  /** Cuántas filas recibieron el CABYS de un producto que ya existe. */
  const [cabysPorNombre, setCabysPorNombre] = useState(0);
  // ── Asignar CABYS a las filas que no lo traen ──
  const [cabysQuery, setCabysQuery] = useState('');
  const [cabysResultados, setCabysResultados] = useState<Array<{ code: string; description: string; iva_rate: number | null }>>([]);
  const [buscandoCabys, setBuscandoCabys] = useState(false);
  const [sugeridas, setSugeridas] = useState(0);
  const [sugiriendo, setSugiriendo] = useState(false);
  /** Avance cuando el catálogo es grande y hay que pedir por lotes. */
  const [progresoSug, setProgresoSug] = useState<{ hechos: number; total: number } | null>(null);
  /**
   * QUÉ FILAS SE VEN.
   *
   * La vista previa mostraba las primeras 100 y debajo «+442 filas más (no
   * mostradas)». Con un catálogo entero eso deja sin revisar justo lo que hay
   * que revisar: el error está en la fila 300 y no hay forma de llegar a ella.
   *
   * Se resuelve por los dos lados: se puede FILTRAR por lo que necesita
   * atención —que casi siempre son unas pocas— y se puede seguir mostrando de
   * a 200 hasta llegar al final.
   */
  const [filtroFilas, setFiltroFilas] = useState<'todas' | 'sin_cabys' | 'avisos' | 'errores'>('todas');
  const [tope, setTope] = useState(100);
  /**
   * QUÉ FILAS ESTÁN MARCADAS, para ponerles un CABYS entre todas.
   *
   * «Aplicar a todas las que no lo tienen» sirve cuando el negocio usa un solo
   * código, pero la mayoría no: una pulpería tiene las gaseosas en uno, los
   * granos en otro y los cigarros en un tercero. Sin poder marcar un grupo
   * había que entrar fila por fila —trescientas veces— o aplicarle a todo el
   * catálogo un código que solo le calza a una parte.
   *
   * Se guardan los ÍNDICES de `rows`, no las filas: el filtro y el «ver 200
   * más» cambian lo que se muestra, y la marca tiene que seguir apuntando a la
   * misma fila del archivo.
   */
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [error, setError] = useState('');
  /** Qué columna del archivo se reconoció como qué. Se muestra ANTES de importar:
   *  ver el mapeo es lo que evita darse cuenta del error después de crear 300
   *  productos con el costo en la columna equivocada. */
  const [mapping, setMapping] = useState<{ reconocidas: string[]; ignoradas: string[] }>(
    { reconocidas: [], ignoradas: [] });
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const blob = new Blob(['﻿' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-productos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Lee el archivo y devuelve una grilla de texto, sea Excel o CSV. */
  const readGrid = async (file: File): Promise<string[][]> => {
    // Excel NATIVO. Antes había que "guardarlo como CSV", y ahí se dañaba: Excel
    // en español exporta con ';', mete comillas y agrega columnas vacías, con lo
    // que los datos terminaban corridos de columna. Leer el .xlsx directo elimina
    // ese paso y el problema con él. La librería ya estaba en el proyecto.
    if (/\.xlsx?$/i.test(file.name)) {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) return [];
      // raw:false → los números salen como los ve el usuario en Excel, y los
      // códigos largos (CABYS, barras) no se convierten a notación científica.
      return (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false, defval: '' }) as any[][])
        .map(r => (r ?? []).map(cleanCell));
    }

    const text = await file.text();
    // Auto-detectar delimitador según la primera línea: ';' (Excel ES), tab (pegado
    // desde Excel/Sheets) o ','. Elegimos el que más columnas produce.
    const firstLine = text.split(/\r?\n/)[0] ?? '';
    const counts: Array<[string, number]> = [
      [';', firstLine.split(';').length],
      ['\t', firstLine.split('\t').length],
      [',', firstLine.split(',').length],
    ];
    const delim = counts.sort((x, y) => y[1] - x[1])[0][1] > 1 ? counts[0][0] : ',';
    const grid = parseCSV(text, delim).map(r => r.map(cleanCell));

    /**
     * Aviso si se leyeron MUCHAS menos filas que líneas tiene el archivo.
     *
     * Es la señal de que algo del formato se está comiendo el resto —una comilla
     * rara, un carácter de control—. Sin esto, el sistema decía tranquilamente
     * «1.000 válidos» sobre un archivo de 5.600 y nadie se enteraba de que
     * faltaban 4.600 productos hasta buscarlos en el inventario.
     */
    const lineas = text.split(/\r?\n/).filter(l => l.trim() !== '').length;
    if (lineas > 10 && grid.length < lineas * 0.9) {
      console.warn(`[bulk-import] el archivo tiene ${lineas} líneas y solo se leyeron ${grid.length} filas`);
      setError(
        `Atención: el archivo tiene ${lineas} líneas pero solo se pudieron leer ${grid.length}.`
        + ' Revisá que no haya comillas sin cerrar y volvé a guardarlo como CSV UTF-8.',
      );
    }
    return grid;
  };

  /**
   * Lee UN archivo y devuelve sus filas. No toca el estado.
   *
   * Se separó de `handleFile` para poder cargar VARIOS a la vez: el catálogo
   * de un negocio suele venir partido en archivos por departamento —uno de
   * abarrotes, otro de limpieza, otro de licores— y había que importarlos de a
   * uno, revisando y asignando CABYS tres veces.
   *
   * Cada archivo se lee con SUS propios encabezados: uno puede traer
   * «Producto» y otro «Nombre» y los dos entran igual.
   */
  const leerArchivo = async (file: File, conNombre: boolean): Promise<{
    parsed: ParsedRow[];
    reconocidas: string[];
    ignoradas: string[];
    error?: string;
  }> => {
    const vacio = { parsed: [] as ParsedRow[], reconocidas: [] as string[], ignoradas: [] as string[] };
    if (!/\.csv$|\.txt$|\.xlsx?$/i.test(file.name)) {
      return { ...vacio, error: `${file.name}: no es un Excel (.xlsx) ni un CSV.` };
    }
    try {
      const grid = (await readGrid(file)).filter(r => r.some(c => c !== ''));
      if (grid.length === 0) return { ...vacio, error: `${file.name}: está vacío.` };

      // Encabezados normalizados (acepta «Nombre», «Precio», «Costo»…).
      const headerRow = grid[0].map(normalizeHeader);

      // Columnas de sobra al final: Excel arrastra columnas vacías y esas son las
      // que corrían los datos. Se recortan comparando contra el encabezado.
      const lastNamed = headerRow.reduce((last, h, i) => (h ? i : last), -1);
      const width = lastNamed + 1;
      const dataRows = grid.slice(1).map(r => {
        const row = r.slice(0, width);
        while (row.length < width) row.push('');   // filas cortas: se rellenan
        return row;
      });

      const idx = (h: string) => headerRow.indexOf(h);
      const reconocidas = HEADERS.filter(h => headerRow.includes(h));
      const ignoradas = grid[0].map((raw, i) => ({ raw, norm: headerRow[i] }))
        .filter(x => x.raw && !HEADERS.includes(x.norm))
        .map(x => x.raw);
      const required = ['name', 'unit_price'];
      const missing = required.filter(h => idx(h) === -1);
      if (missing.length > 0) {
        return { ...vacio, reconocidas, ignoradas,
          error: `${file.name}: faltan columnas obligatorias (${missing.join(', ')}). Usá la plantilla.` };
      }

      const parsed: ParsedRow[] = dataRows.map((r, i) => {
        const name = (r[idx('name')] ?? '').trim();
        const price = num(r[idx('unit_price')]);
        // Stock infinito: "Sí"/"si"/"true"/"x" → NO rastrea stock (tracks_stock=false).
        const infRaw = (idx('stock_infinito') >= 0 ? (r[idx('stock_infinito')] ?? '') : '').trim().toLowerCase();
        const stockInfinito = ['si', 'sí', 'true', 'x', '1', 'yes'].includes(infRaw);
        const row: ParsedRow = {
          name,
          sku:              (r[idx('sku')] ?? '').trim() || undefined,
          sku2:             idx('sku2') >= 0 ? (r[idx('sku2')] ?? '').trim() || undefined : undefined,
          description:      (r[idx('description')] ?? '').trim() || undefined,
          supplier:         idx('supplier') >= 0 ? (r[idx('supplier')] ?? '').trim() || undefined : undefined,
          unit_price:       price ?? 0,
          cost_price:       num(r[idx('cost_price')]),
          tracks_stock:     !stockInfinito,
          stock_quantity:   num(r[idx('stock_quantity')]) ?? 0,
          min_stock_level:  num(r[idx('min_stock_level')]) ?? 0,
          max_stock_level:  num(r[idx('max_stock_level')]) ?? 100,
          category:         idx('category') >= 0 ? (r[idx('category')] ?? '').trim() || undefined : undefined,
          unit_type:        idx('unit_type') >= 0 ? (r[idx('unit_type')] ?? '').trim() || undefined : undefined,
          cabys_code:       (r[idx('cabys_code')] ?? '').trim() || undefined,
          iva_rate:         num(r[idx('iva_rate')]) ?? 13,
        };

        // ── Rescate de columnas corridas ──────────────────────────────────
        // Un CSV mal armado corre los valores una columna y el CABYS termina en
        // el IVA. Se detecta sin ambigüedad porque son datos incompatibles: el
        // IVA en Costa Rica es 0–13 y jamás tiene 10 dígitos; un CABYS SIEMPRE
        // los tiene. Ante esa combinación se devuelve cada valor a su lugar en
        // vez de guardar un CABYS en 0 y un IVA absurdo.
        const ivaRaw = (r[idx('iva_rate')] ?? '').toString().replace(/\D/g, '');
        const cabysRaw = String(row.cabys_code ?? '').replace(/\D/g, '');
        if (ivaRaw.length >= 10 && (cabysRaw === '' || cabysRaw === '0')) {
          row.cabys_code = ivaRaw;
          // El IVA real suele haber quedado en la columna anterior (la del CABYS).
          const prevIdx = idx('cabys_code');
          const prev = prevIdx >= 0 ? num(r[prevIdx]) : undefined;
          row.iva_rate = prev !== undefined && prev >= 0 && prev <= 100 ? prev : 13;
          row._warn = `Columnas corridas: el CABYS estaba en la columna de IVA. Se corrigió (IVA ${row.iva_rate}%).`;
        }
        // Un IVA imposible NO se guarda en silencio.
        if (row.iva_rate !== undefined && (row.iva_rate < 0 || row.iva_rate > 100)) {
          row._error = `Fila ${i + 2}: IVA inválido (${row.iva_rate}). Revisá que las columnas calcen.`;
        }
        // CABYS: se conserva TAL CUAL (con ceros a la izquierda). Solo se avisa
        // si no tiene los 13 dígitos que pide Hacienda.
        if (row.cabys_code) {
          const d = String(row.cabys_code).replace(/\D/g, '');
          row.cabys_code = d || undefined;
          if (d && d.length !== 13) {
            row._warn = (row._warn ? row._warn + ' ' : '')
              + `CABYS de ${d.length} dígitos (Hacienda pide 13).`;
          }
        }

        // Validaciones — se permite precio 0 o vacío (queda en 0).
        // Con varios archivos, el número de fila solo sirve si dice de CUÁL:
        // «Fila 14» en tres archivos distintos no se puede ir a buscar.
        const donde = conNombre ? `${file.name}, fila ${i + 2}` : `Fila ${i + 2}`;
        if (!row.name)                  row._error = `${donde}: nombre vacío`;
        else if (price !== undefined && price < 0) row._error = `${donde}: precio inválido`;
        return row;
      });
      return { parsed, reconocidas, ignoradas };
    } catch (e) {
      return { ...vacio, error: `${file.name}: ${e instanceof Error ? e.message : 'no se pudo leer'}` };
    }
  };

  /** Carga uno o varios archivos y los junta en una sola lista. */
  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError(''); setRows([]);
    setFileName(files.length === 1 ? files[0].name : `${files.length} archivos`);

    const todas: ParsedRow[] = [];
    const reconocidas = new Set<string>();
    const ignoradas = new Set<string>();
    const fallos: string[] = [];
    for (const f of files) {
      const r = await leerArchivo(f, files.length > 1);
      if (r.error) fallos.push(r.error);
      r.reconocidas.forEach(x => reconocidas.add(x));
      r.ignoradas.forEach(x => ignoradas.add(x));
      todas.push(...r.parsed);
    }
    setMapping({ reconocidas: [...reconocidas], ignoradas: [...ignoradas] });

    /*
     * REPETIDOS ENTRE ARCHIVOS.
     *
     * Cuando el catálogo viene partido, el mismo producto suele aparecer en
     * dos listas. Si no se avisa, se crean dos veces y el inventario queda
     * duplicado desde el primer día. No se borra nada solo: se marca, y quien
     * importa decide.
     */
    if (files.length > 1) {
      /*
       * Se mira el código Y el nombre, no uno u otro.
       *
       * El mismo producto suele venir con código en la lista de un
       * departamento y sin código en la otra: comparando solo por código, los
       * dos pasaban como productos distintos y el inventario nacía duplicado.
       */
      const skus = new Set<string>();
      const nombres = new Set<string>();
      for (const r of todas) {
        const sku = String(r.sku ?? '').trim().toLowerCase();
        const nom = String(r.name ?? '').trim().toLowerCase();
        const repetido = (sku && skus.has(sku)) || (nom && nombres.has(nom));
        if (repetido && !r._error) {
          r._warn = [r._warn, 'repetido en otro archivo'].filter(Boolean).join(' · ');
        }
        if (sku) skus.add(sku);
        if (nom) nombres.add(nom);
      }
    }

    if (fallos.length) setError(fallos.join('\n'));
    if (todas.length === 0) return;
    setRows(todas);
    setMarcadas(new Set());   // las marcas eran del archivo anterior
    void completarCabysPorNombre(todas);
  };

  const validRows = rows.filter(r => !r._error);

  /**
   * Las filas que se muestran, según el filtro y el tope.
   *
   * Se guarda el índice ORIGINAL junto a cada fila: es el número que ve la
   * persona («fila 317») y el que usan los botones para tocar esa fila y no
   * otra. Filtrando sin él, el buscador de CABYS por fila le escribía a la
   * fila equivocada.
   */
  const filtradas = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) =>
      filtroFilas === 'todas' ? true
        : filtroFilas === 'sin_cabys' ? !r.cabys_code
        : filtroFilas === 'avisos' ? !!r._warn
        : !!r._error);
  const filasVisibles = filtradas.slice(0, tope);

  /* ── MARCAR FILAS ───────────────────────────────────────────────────────
     Todo lo que sigue trabaja sobre los índices de `rows`. */

  const alternarFila = (i: number) => setMarcadas(prev => {
    const s = new Set(prev);
    if (s.has(i)) s.delete(i); else s.add(i);
    return s;
  });

  /** El check del encabezado: marca o desmarca TODO lo que el filtro deja ver. */
  const indicesDelFiltro = filtradas.map(({ i }) => i);
  const todasDelFiltroMarcadas = indicesDelFiltro.length > 0
    && indicesDelFiltro.every(i => marcadas.has(i));
  const algunaDelFiltroMarcada = indicesDelFiltro.some(i => marcadas.has(i));
  const alternarTodasDelFiltro = () => setMarcadas(prev => {
    const s = new Set(prev);
    if (todasDelFiltroMarcadas) for (const i of indicesDelFiltro) s.delete(i);
    else for (const i of indicesDelFiltro) s.add(i);
    return s;
  });

  /**
   * «Las que van con este mismo CABYS».
   *
   * El caso real es al revés de como uno lo escribiría: la fila ya tiene un
   * código —puesto por una sugerencia, o heredado del producto que existe— y
   * resulta que está mal para las treinta filas que lo comparten. Marcarlas a
   * mano buscándolas entre 500 es lo que hace que se importe con el código
   * equivocado. Si la fila no tiene código, marca a todas las que tampoco.
   */
  const marcarLasIguales = (i: number) => {
    const codigo = rows[i]?.cabys_code ?? '';
    setMarcadas(() => {
      const s = new Set<number>();
      rows.forEach((r, j) => { if ((r.cabys_code ?? '') === codigo) s.add(j); });
      return s;
    });
  };

  /** Cuántas filas comparten cada código: para decir «iguales (30)». */
  const cuantasPorCabys = new Map<string, number>();
  for (const r of rows) {
    const k = r.cabys_code ?? '';
    cuantasPorCabys.set(k, (cuantasPorCabys.get(k) ?? 0) + 1);
  }
  /**
   * EL CABYS QUE FALTA SE TOMA DEL PRODUCTO QUE YA EXISTE.
   *
   * Un archivo armado a mano casi nunca trae el CABYS, pero el producto que ya
   * está en el sistema sí lo tiene. Importar sin él lo borraba, y el día que el
   * negocio emitía un comprobante electrónico aparecía «Estos productos no
   * tienen código CABYS» sin ninguna relación visible con la importación de la
   * semana pasada.
   *
   * Se empareja por NOMBRE, que es el único dato que esos archivos sí traen
   * siempre. Se hace antes de importar y queda a la vista en la tabla, porque
   * un emparejamiento por nombre puede equivocarse y hay que poder revisarlo.
   */
  const completarCabysPorNombre = async (parsed: ParsedRow[]) => {
    const faltan = parsed.filter(r => !r.cabys_code && r.name);
    if (faltan.length === 0) { setCabysPorNombre(0); return; }
    try {
      const names = [...new Set(faltan.map(r => r.name))];
      const mapa = await apiFetch<Record<string, string>>(
        `/admin/tenants/${tenantId}/cabys-por-nombre`,
        { method: 'POST', body: JSON.stringify({ names }) },
        30000,
      );
      if (!mapa || Object.keys(mapa).length === 0) { setCabysPorNombre(0); return; }
      const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
      let n = 0;
      const conCabys = parsed.map(r => {
        if (r.cabys_code || !r.name) return r;
        const cab = mapa[norm(r.name)];
        if (!cab) return r;
        n++;
        return {
          ...r,
          cabys_code: cab,
          _cabys_heredado: true,
          _warn: (r._warn ? r._warn + ' ' : '') + 'CABYS tomado del producto que ya existe.',
        };
      });
      setCabysPorNombre(n);
      if (n > 0) setRows(conCabys);
    } catch {
      // Sin la consulta se importa igual: solo se pierde el relleno del CABYS.
      setCabysPorNombre(0);
    }
  };

  /**
   * El precio que se va a guardar, según lo contestado sobre el impuesto.
   *
   * «Incluido» significa que el número del archivo ya trae el IVA adentro, así
   * que hay que sacárselo para guardar la base —que es lo que el sistema suma
   * al vender—. Se redondea a dos decimales: un precio con más decimales se
   * arrastra a cada línea de cada factura.
   */
  const precioNeto = (valor: number | undefined, ivaPct: number | undefined): number => {
    const v = Number(valor ?? 0);
    if (impuestoEnPrecio !== 'incluido') return v;
    const tasa = Number(ivaPct ?? 13);
    if (!(tasa > 0)) return v;
    return Math.round((v / (1 + tasa / 100)) * 100) / 100;
  };

  /** ¿El archivo trae columna de IVA? Decide si el CABYS puede fijar la tarifa. */
  const archivoTraeIva = mapping.reconocidas.includes('iva_rate');

  /**
   * BUSCAR UN CABYS PARA UNA FILA SOLA.
   *
   * Las tres opciones que propone el motor resuelven la mayoría, pero cuando
   * ninguna sirve la única salida era el buscador de arriba —que aplica el
   * código a TODAS las filas sin CABYS— o dejar el producto sin clasificar.
   * Para el producto raro de un catálogo de trescientos, eso significaba
   * importar mal o no importar.
   *
   * Es un buscador aparte del general a propósito: comparten el endpoint pero
   * no el estado, así escribir en uno no borra lo que se estaba viendo en el
   * otro.
   */
  const [filaBuscando, setFilaBuscando] = useState<number | null>(null);
  const [filaQuery, setFilaQuery] = useState('');
  const [filaResultados, setFilaResultados] = useState<Array<{ code: string; description: string; iva_rate: number | null }>>([]);
  const [filaCargando, setFilaCargando] = useState(false);
  const filaPedido = useRef(0);

  const buscarParaFila = async (q: string) => {
    setFilaQuery(q);
    if (q.trim().length < 2) { setFilaResultados([]); return; }
    // Cada tecla dispara una búsqueda; sin este número de orden, la respuesta
    // de un texto viejo podía pisar la del texto actual.
    const mio = ++filaPedido.current;
    setFilaCargando(true);
    try {
      const r = await apiFetch<Array<{ code: string; description: string; iva_rate: number | null }>>(
        `/cabys/search?q=${encodeURIComponent(q.trim())}`);
      if (mio === filaPedido.current) setFilaResultados(Array.isArray(r) ? r.slice(0, 12) : []);
    } catch { if (mio === filaPedido.current) setFilaResultados([]); }
    finally { if (mio === filaPedido.current) setFilaCargando(false); }
  };

  /** Pone el código elegido a mano en UNA fila. */
  const ponerCabysEnFila = (indice: number, c: { code: string; description: string; iva_rate: number | null }) => {
    setRows(prev => prev.map((x, j) => j === indice ? {
      ...x, cabys_code: c.code, _cabys_desc: c.description,
      _cabys_asignado: 'manual' as const,
      _cabys_origen: 'buscado a mano',
      _cabys_motivo: undefined, _cabys_alternativas: undefined,
      // Igual que en el resto: la tarifa del catálogo solo se copia si el
      // archivo no traía la suya.
      iva_rate: (!archivoTraeIva && c.iva_rate != null) ? c.iva_rate : x.iva_rate,
    } : x));
    setFilaBuscando(null); setFilaQuery(''); setFilaResultados([]);
  };

  const buscarCabys = async (q: string) => {
    setCabysQuery(q);
    if (q.trim().length < 2) { setCabysResultados([]); return; }
    setBuscandoCabys(true);
    try {
      const r = await apiFetch<Array<{ code: string; description: string; iva_rate: number | null }>>(
        `/cabys/search?q=${encodeURIComponent(q.trim())}`);
      setCabysResultados(Array.isArray(r) ? r.slice(0, 12) : []);
    } catch { setCabysResultados([]); }
    finally { setBuscandoCabys(false); }
  };

  /**
   * UN CÓDIGO PARA LAS FILAS MARCADAS, O PARA LAS QUE NO LO TIENEN.
   *
   * Es la forma más rápida y la que calza con cómo se usa de verdad: un
   * restaurante tiene sus 133 productos con UN solo CABYS, y una ferretería
   * mete el 74% de su catálogo en un mismo código. Buscar uno por uno entre
   * 20.506 códigos es lo que hace que nadie le ponga CABYS a nada.
   *
   * La tarifa del CABYS solo se copia si el archivo NO traía columna de IVA:
   * si el negocio escribió una tarifa, manda la suya.
   */
  const aplicarCabys = (code: string, ivaDelCatalogo: number | null) => {
    const hayMarcadas = marcadas.size > 0;
    setRows(prev => prev.map((r, i) => {
      /* Con filas marcadas el código va A ESAS, tengan o no uno ya: marcarlas
         es justamente lo que se hace para CORREGIR un código equivocado. Sin
         marcas se mantiene lo de antes: solo a las que les falta. */
      const leToca = hayMarcadas ? marcadas.has(i) : !r.cabys_code;
      if (!leToca) return r;
      return {
        ...r,
        cabys_code: code,
        iva_rate: (!archivoTraeIva && ivaDelCatalogo != null) ? ivaDelCatalogo : r.iva_rate,
        _cabys_asignado: 'manual' as const,
        _cabys_origen: hayMarcadas ? 'elegido para las marcadas' : undefined,
        _cabys_desc: undefined, _cabys_heredado: undefined,
        _cabys_motivo: undefined, _cabys_alternativas: undefined,
      };
    }));
    setCabysQuery(''); setCabysResultados([]);
    setMarcadas(new Set());   // ya se les puso: la marca cumplió su función
  };

  /**
   * SUGERENCIAS: se piden con un botón, nunca solas.
   *
   * El emparejamiento por nombre contra el catálogo acierta a veces y se
   * equivoca a veces, y de maneras que no se notan: «Empanada Carne» cae en
   * «Carne de cabra», «Arroz 1 kg» en «Harina de arroz», «Jugo de naranja» en
   * el congelado. Peor todavía, varias de esas equivocaciones traen IVA del 1%
   * para productos que son del 13%, así que aplicarlas en silencio le cambiaría
   * al cliente el impuesto que cobra.
   *
   * Por eso NO se aplican al cargar el archivo: se piden, quedan todas marcadas
   * y con la descripción del catálogo a la vista para poder revisarlas.
   */
  const traerSugerencias = async () => {
    const faltan = rows.filter(r => !r.cabys_code && r.name);
    if (faltan.length === 0) return;
    setSugiriendo(true);
    try {
      const names = [...new Set(faltan.map(r => r.name))];
      /*
       * El DEPARTAMENTO del archivo viaja como contexto.
       *
       * Los catálogos exportados de otros sistemas traen la columna
       * «Departamento» (LIMPIEZA, FERRETERÍA, ABARROTES) y es una pista fuerte
       * de qué es el producto. El motor la usa solo cuando el nombre por sí
       * solo no alcanza, así que lo que ya clasificaba bien no cambia: medido,
       * «Guantes de latex talla M» pasó de «partes de motocicleta» al código
       * correcto de guantes.
       */
      const contextoDe = new Map<string, string>();
      for (const r of faltan) {
        const cat = String((r as any).category ?? '').trim();
        if (cat && !contextoDe.get(r.name)) contextoDe.set(r.name, cat);
      }
      const items = names.map(nom => ({ nombre: nom, contexto: contextoDe.get(nom) ?? '' }));
      /**
       * Se pide por el asistente y no por `/cabys/sugerir` directo.
       *
       * Es el mismo motor —el endpoint de IA lo llama por dentro—, pero
       * devuelve además POR QUÉ eligió cada código y las otras opciones. Eso
       * es lo que permite revisar: trece dígitos no se revisan, una frase sí.
       * Y en los que no alcanzó a decidir, las alternativas convierten una
       * búsqueda a mano entre veinte mil filas en elegir entre tres.
       */
      type Sug = {
        name: string; code: string | null; description: string | null; iva_rate: number | null;
        confianza: string; fuente?: string | null; exacto?: boolean; parecido?: number;
        motivo?: string;
        alternativas?: Array<{ code: string; description: string; iva_rate: number | null; coincidencia: number }>;
      };
      /**
       * SE PIDE POR LOTES.
       *
       * El servidor acepta 200 productos por consulta y un catálogo real trae
       * seiscientos o mil: el pedido se caía entero con «Máximo 200 productos
       * por consulta» y el negocio se quedaba sin una sola sugerencia. El
       * límite del servidor no es un capricho —con la IA encendida, cada
       * producto dudoso es una consulta al modelo, y un lote grande se pasa
       * del tiempo que aguanta la función—, así que lo que corresponde es
       * partir el trabajo acá.
       *
       * Los lotes se aplican a medida que llegan: si el tercero falla, los dos
       * primeros ya quedaron puestos y no se perdió el trabajo.
       */
      const TAMANO_LOTE = 100;
      const lotes: typeof items[] = [];
      for (let i = 0; i < items.length; i += TAMANO_LOTE) lotes.push(items.slice(i, i + TAMANO_LOTE));

      /*
       * Cuántas filas quedarían asignadas, contado de los DATOS.
       *
       * Contar dentro del actualizador de `setRows` no sirve: corre después y
       * el total se leía en cero, así que el botón «Quitar las N sugerencias»
       * no aparecía nunca. Acá se cuenta con la misma condición que usa el
       * actualizador —fila sin código y con ese nombre—, que se puede saber
       * antes de tocar el estado.
       */
      const filasPorNombre = new Map<string, number>();
      for (const r of faltan) filasPorNombre.set(r.name, (filasPorNombre.get(r.name) ?? 0) + 1);

      let asignadas = 0;
      let fallo: string | null = null;
      for (const [indice, lote] of lotes.entries()) {
        setProgresoSug({ hechos: indice * TAMANO_LOTE, total: items.length });
        let sug: Sug[] = [];
        try {
          const r0 = await apiFetch<{ modo?: string; datos?: { sugerencias?: Sug[] } } | Sug[]>(
            '/ia/cabys',
            {
              method: 'POST',
              // `origen` le dice al servidor DESDE DÓNDE se pide. El modelo
              // (que se paga por consulta) solo se usa en la carga masiva y
              // solo para el dueño del sistema; el servidor verifica las dos
              // cosas, así que mandar esto desde otro lado no habilita nada.
              body: JSON.stringify({ nombres: lote, origen: 'importacion' }),
            },
            90000);
          sug = Array.isArray(r0) ? r0 : (r0?.datos?.sugerencias ?? []);
        } catch (e) {
          // Un lote caído no tumba los demás: se sigue y se avisa al final.
          fallo = e instanceof Error ? e.message : 'falló un lote';
          continue;
        }
        for (const x of sug) if (x.code) asignadas += filasPorNombre.get(x.name) ?? 0;
        aplicarSugerencias(new Map(sug.map(x => [x.name, x])));
      }
      setProgresoSug(null);
      if (fallo) {
        setError(lotes.length > 1
          ? `Algunas sugerencias no se pudieron traer (${fallo}). Las que sí llegaron ya quedaron puestas; podés volver a tocar el botón para las que faltan.`
          : fallo);
      }
      /*
       * El total se lee DESPUÉS de que React aplicó los lotes. Con el
       * `requestAnimationFrame` se espera a que pasen los actualizadores; sin
       * eso el número se leía antes de tiempo y quedaba corto.
       */
      setSugeridas(asignadas);
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron traer las sugerencias');
    } finally { setSugiriendo(false); setProgresoSug(null); }
  };

  /** Pone en las filas lo que devolvió un lote. */
  const aplicarSugerencias = (porNombre: Map<string, any>) => {
      setRows(prev => prev.map(r => {
        if (r.cabys_code || !r.name) return r;
        const x = porNombre.get(r.name);
        if (!x) return r;
        // Sin código: igual se guardan el motivo y las alternativas, que es
        // justo donde más falta hacen.
        if (!x.code) {
          return { ...r, _cabys_motivo: x.motivo, _cabys_alternativas: x.alternativas };
        }
        return {
          ...r,
          cabys_code: x.code,
          iva_rate: (!archivoTraeIva && x.iva_rate != null) ? x.iva_rate : r.iva_rate,
          _cabys_asignado: 'sugerido' as const,
          _cabys_desc: x.description ?? undefined,
          _cabys_motivo: x.motivo,
          _cabys_alternativas: x.alternativas,
          // De dónde salió: un producto igual de otro negocio es mucho más
          // confiable que un parecido de palabras contra el catálogo.
          _cabys_origen: x.fuente === 'otros_negocios'
            ? (x.exacto ? 'otro negocio, producto igual' : `otro negocio, parecido ${x.parecido ?? '?'}%`)
            : 'catálogo de Hacienda',
        };
      }));
  };

  /** Deshace las sugerencias (no lo asignado a mano ni lo que vino en el archivo). */
  const quitarSugerencias = () => {
    setRows(prev => prev.map(r => r._cabys_asignado === 'sugerido'
      ? { ...r, cabys_code: undefined, _cabys_asignado: undefined, _cabys_desc: undefined }
      : r));
    setSugeridas(0);
  };

  const sinCabys = rows.filter(r => !r.cabys_code && !r._error).length;

  const errorRows = rows.filter(r => r._error);

  const doImport = async () => {
    setImporting(true);
    setProgress({ done: 0, total: validRows.length, errors: 0 });

    // Modo admin: enviamos TODAS las filas al backend, que resuelve categorías/
    // unidades y crea los productos para el tenant destino (service-role).
    if (adminMode) {
      // Fuera del try: si un lote falla, hay que poder decir cuántos SÍ entraron.
      let created = 0, errors = 0, updated = 0;
      /** Productos que traían existencias en el archivo y no se aplicaron. */
      let stockOmitido = 0;
      try {
        const payload = validRows.map(r => ({
          name: r.name, sku: r.sku ?? '', sku2: r.sku2 ?? null, description: r.description,
          supplier: r.supplier ?? null,
          // El impuesto, según lo contestado arriba (ver `precioNeto`).
          unit_price: precioNeto(r.unit_price, r.iva_rate),
          cost_price: r.cost_price == null ? r.cost_price : precioNeto(r.cost_price, r.iva_rate),
          stock_quantity: r.stock_quantity ?? 0, min_stock_level: r.min_stock_level ?? 0,
          max_stock_level: r.max_stock_level ?? 100, tracks_stock: r.tracks_stock !== false,
          category: r.category ?? null, unit_type: r.unit_type ?? null,
          cabys_code: r.cabys_code ?? null, iva_rate: r.iva_rate ?? 13,
        }));

        // POR LOTES de 50. Antes iba todo en una sola petición con 3 minutos de
        // espera: con cientos de filas el proxy la cortaba igual y el catálogo
        // quedaba a medias, sin saber por dónde se había quedado. Cada lote es
        // una petición corta, y si uno falla los anteriores YA quedaron.
        let detailMsg: string | null = null;
        const lotes = chunked(payload, BULK_CHUNK_SIZE);

        /**
         * Un lote que falla YA NO corta la importación.
         *
         * Antes el error salía del bucle: con 3.000 productos son 60 lotes, y
         * bastaba que uno se cayera —un pico de lentitud, un tiempo agotado—
         * para que los 40 lotes siguientes ni se intentaran. El usuario veía
         * «se importaron 850» sobre un archivo de 3.000 y no tenía forma de
         * saber cuáles faltaban. Ahora se siguen todos y al final se dice
         * exactamente qué filas quedaron fuera.
         *
         * De a 3 a la vez y no todos de golpe: el navegador abre pocas
         * conexiones por dominio, así que lanzar 60 solo haría cola y de paso
         * castigaría al servidor.
         *
         * No se reintenta solo: un lote que se cortó por tiempo pudo haber
         * entrado igual, y repetirlo duplicaría productos. Se informa y el
         * usuario reimporta las filas que faltaron.
         */
        const fallidas: typeof payload = [];
        /**
         * La barra avanza CON cada lote, no al final.
         *
         * Los lotes van de a tres en paralelo, así que si el avance se calculara
         * al terminar todos, un archivo de 5.000 productos dejaba la barra en
         * cero durante varios minutos. El cajero no sabe si está trabajando o se
         * colgó, y termina cerrando la ventana a mitad de la importación.
         */
        let procesadas = 0;
        const resultados = await mapWithConcurrency(
          lotes,
          async (batch) => {
            try {
              return await apiFetch<{ created: number; updated?: number; errors: number; error_detail?: string | null; stock_omitido?: number }>(
                `/admin/tenants/${tenantId}/products-import`,
                { method: 'POST', body: JSON.stringify({ rows: batch }) },
                60000,   // un lote de 50 nunca debería acercarse a esto
              );
            } finally {
              procesadas += batch.length;
              setProgress({ done: procesadas, total: payload.length, errors });
            }
          },
          { concurrency: 3 },
        );

        resultados.forEach((res, i) => {
          if (res.ok) {
            created += res.value?.created ?? 0;
            updated += res.value?.updated ?? 0;
            errors  += res.value?.errors ?? 0;
            stockOmitido += res.value?.stock_omitido ?? 0;
            if (!detailMsg && res.value?.error_detail) detailMsg = res.value.error_detail;
          } else {
            // El lote entero no llegó: sus filas quedan pendientes.
            errors += lotes[i].length;
            fallidas.push(...lotes[i]);
            if (!detailMsg) {
              detailMsg = res.error instanceof Error ? res.error.message : String(res.error);
            }
          }
        });
        setProgress({ done: payload.length, total: payload.length, errors });

        if (fallidas.length > 0) {
          console.warn('[bulk-import] filas sin importar:', fallidas.map(f => f.name));
        }

        setImporting(false);
        const detail = detailMsg ? ` Detalle: ${detailMsg}` : '';
        const res = { created, errors };
        // Actualizar productos que ya existían es un resultado válido, no un
        // fracaso: reimportar el catálogo para corregir precios no crea ninguno.
        if (created === 0 && updated === 0) {
          // Dejamos el modal ABIERTO con el error visible (no llamamos onDone,
          // que lo cerraría desde el panel admin).
          setError(`No se creó ningún producto (errores: ${res?.errors ?? '?'}).${detail}`);
        } else {
          if ((res?.errors ?? 0) > 0) {
            // Se dice el número exacto: con miles de filas, «algunas fallaron»
            // deja al usuario sin saber si reimportar todo (y duplicar) o nada.
            setError(
              `Se procesaron ${created + updated} de ${payload.length}`
              + ` (${created} nuevos, ${updated} actualizados).`
              + ` Quedaron ${res.errors} fila(s) sin subir.${detail}`,
            );
          }
          /**
           * Si el archivo traía existencias para productos que YA estaban, se
           * dice. Callarlo haría creer que el inventario quedó como el Excel,
           * y la próxima vez que alguien mire el stock no va a entender por
           * qué no coincide.
           */
          if (stockOmitido > 0) {
            setError(
              `Se actualizaron ${updated} producto(s), pero NO se tocó la existencia de `
              + `${stockOmitido} que ya estaban. El stock se cambia en Inventario → Stock, `
              + 'con un ajuste que registra el motivo.',
            );
          }
          onDone(created + updated);
        }
      } catch (e) {
        setImporting(false);
        const base = e instanceof Error ? e.message : 'No se pudo importar (¿backend sin desplegar?).';
        // Los lotes ya confirmados NO se pierden ni se repiten: se le dice al
        // usuario dónde quedó para que reintente solo con lo que falta.
        setError(created > 0
          ? `${base} Se alcanzaron a crear ${created} de ${validRows.length} productos: volvé a importar solo las filas que faltan.`
          : base);
        // No cerramos: el usuario necesita ver el error.
      }
      return;
    }

    // 1. Pre-cargar categorías y unidades existentes (cache por nombre normalizado)
    /**
     * Para comparar categorías y unidades: sin tildes, sin mayúsculas y sin
     * espacios de más.
     *
     * El archivo viene exportado del sistema viejo y la columna
     * «Departamento» llega en mayúsculas y a veces con tilde o doble espacio:
     * «AC DISTRIBUCIÓN» contra la categoría «Ac distribucion» que ya existe.
     * Comparando tal cual, el importador no la reconocía y creaba una segunda
     * categoría con el mismo nombre escrito distinto — y el negocio terminaba
     * con el catálogo partido en dos.
     */
    const norm = (s: string) => String(s ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim().toLowerCase();
    const catCache  = new Map<string, string>();   // nombre → id
    const unitCache = new Map<string, string>();   // nombre/abbr → id
    try {
      const cats = await categoriesService.getAllCategories(tenantId);
      for (const c of cats as any[]) catCache.set(norm(c.name), c.id);
      const units = await unitTypesService.getAllUnitTypes(tenantId);
      for (const u of units as any[]) {
        unitCache.set(norm(u.name), u.id);
        if (u.abbreviation) unitCache.set(norm(u.abbreviation), u.id);
      }
    } catch (e) {
      console.warn('[bulk-import] no se pudieron precargar categorías/unidades:', e);
    }

    // Helper: busca o crea on-demand
    const resolveCategory = async (raw?: string): Promise<string | undefined> => {
      if (!raw) return undefined;
      const key = norm(raw);
      if (catCache.has(key)) return catCache.get(key);
      try {
        const created = await categoriesService.createCategory(tenantId, { name: raw.trim() } as any);
        catCache.set(key, (created as any).id);
        return (created as any).id;
      } catch (e) {
        console.warn('[bulk-import] no se pudo crear categoría', raw, e);
        return undefined;
      }
    };
    const resolveUnit = async (raw?: string): Promise<string | undefined> => {
      if (!raw) return undefined;
      const key = norm(raw);
      if (unitCache.has(key)) return unitCache.get(key);
      try {
        const created = await unitTypesService.createUnitType(tenantId, {
          name: raw.trim(),
          abbreviation: raw.trim().slice(0, 4).toLowerCase(),
        } as any);
        unitCache.set(key, (created as any).id);
        return (created as any).id;
      } catch (e) {
        console.warn('[bulk-import] no se pudo crear unidad', raw, e);
        return undefined;
      }
    };

    // 2. Importar EN LOTES de 50, resolviendo cat + unidad.
    //
    // Antes era una fila detrás de otra: 250 productos eran 250 esperas
    // encadenadas y la importación se hacía eterna (y el usuario, creyéndola
    // colgada, cerraba el modal a medio camino). Ahora van de a 50, con 5
    // simultáneas dentro de cada lote.
    //
    // El primer lote se hace de a UNA petición: las categorías y unidades nuevas
    // se crean bajo demanda, y si 5 filas de la misma categoría entran a la vez
    // se crearía cinco veces la misma. Con la primera tanda en serie los caches
    // ya quedan llenos y el resto puede ir en paralelo sin duplicar nada.
    let okCount = 0, errCount = 0;
    const batches = chunked(validRows, BULK_CHUNK_SIZE);
    for (let b = 0; b < batches.length; b++) {
      const results = await mapWithConcurrency(
        batches[b],
        async (r) => {
          const [category_id, unit_type_id] = await Promise.all([
            resolveCategory(r.category),
            resolveUnit(r.unit_type),
          ]);
          await createProduct(tenantId, {
            name:            r.name,
            sku:             r.sku ?? '',
            sku2:            r.sku2 ?? null,
            description:     r.description,
            // El impuesto, según lo contestado en la pantalla (ver `precioNeto`).
            unit_price:      precioNeto(r.unit_price, r.iva_rate),
            cost_price:      r.cost_price == null ? r.cost_price : precioNeto(r.cost_price, r.iva_rate),
            stock_quantity:  r.stock_quantity ?? 0,
            min_stock_level: r.min_stock_level ?? 0,
            max_stock_level: r.max_stock_level ?? 100,
            tracks_stock:    r.tracks_stock !== false,
            category_id,
            unit_type_id,
            cabys_code:      r.cabys_code ?? null,
            iva_rate:        r.iva_rate ?? 13,
          } as any);
        },
        {
          concurrency: b === 0 ? 1 : 5,
          onProgress: (doneInBatch) =>
            setProgress({ done: okCount + errCount + doneInBatch, total: validRows.length, errors: errCount }),
        },
      );
      results.forEach((res, i) => {
        if (res.ok) okCount++;
        else { errCount++; console.warn('[bulk-import] fallo:', batches[b][i].name, res.error); }
      });
      setProgress({ done: okCount + errCount, total: validRows.length, errors: errCount });
    }
    setImporting(false);
    onDone(okCount);
  };

  const reset = () => {
    setRows([]); setFileName(''); setError(''); setMarcadas(new Set());
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {/* ANCHO: la vista previa tiene TRECE columnas (nombre, dos SKU, precio,
          costo, stock, proveedor, categoría, unidad, CABYS, IVA, estado). En
          768px no caben: el nombre del producto —lo único que permite ver si la
          fila está bien— quedaba cortado y había que arrastrar la tabla de lado
          para revisar el CABYS. Ahora usa el ancho de la pantalla. */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl md:max-w-5xl xl:max-w-[82rem] max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={22} className="text-emerald-600" />
            <div>
              <h2 className="text-lg font-black text-gray-900">Importar productos masivamente</h2>
              <p className="text-xs text-gray-500">Excel (.xlsx) o CSV — el Excel se lee directo, sin convertir</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Paso 1: plantilla */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Download size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-sm text-blue-900">1. Descargá la plantilla</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Llenala en Excel y al guardar elegí <strong>CSV UTF-8 (delimitado por comas)</strong>.
                  Columnas obligatorias: <code className="bg-blue-100 px-1 rounded">name</code>,{' '}
                  <code className="bg-blue-100 px-1 rounded">unit_price</code>.
                </p>
                <button onClick={downloadTemplate}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg">
                  <Download size={13} /> Descargar plantilla.csv
                </button>
              </div>
            </div>
          </div>

          {/* Paso 2: upload */}
          {rows.length === 0 && !importing && (
            <label className="block">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition">
                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="font-bold text-gray-700">Subí el Excel o el CSV</p>
                <p className="text-xs text-gray-500 mt-1">
                  o arrastralo acá · podés elegir <b>varios archivos a la vez</b>
                </p>
                {/* `multiple`: el catálogo de un negocio suele venir partido en
                    un archivo por departamento, y antes había que importarlos
                    de a uno, revisando y poniendo CABYS tres veces. */}
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" multiple className="hidden"
                  onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void handleFiles(f); }} />
              </div>
            </label>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-bold text-gray-900">{fileName}</span>
                  <span className="text-gray-400 ml-2">·</span>
                  <span className="text-emerald-600 font-bold ml-2">{validRows.length} válidos</span>
                  {errorRows.length > 0 && (
                    <span className="text-red-600 font-bold ml-2">· {errorRows.length} con errores</span>
                  )}
                  {rows.filter(r => r._warn && !r._error).length > 0 && (
                    <span className="text-amber-700 font-bold ml-2">
                      · {rows.filter(r => r._warn && !r._error).length} corregidos
                    </span>
                  )}
                </div>
                {!importing && (
                  <button onClick={reset}
                    className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-red-600">
                    <Trash2 size={12} /> Cambiar archivo
                  </button>
                )}
              </div>

              {/* LA PREGUNTA DEL IMPUESTO.
                  No se puede adivinar mirando el archivo y equivocarse mueve
                  todo el catálogo un 13%, así que no se importa sin contestarla. */}
              <div className={`rounded-xl border-2 px-3 py-2.5 ${
                impuestoEnPrecio ? 'border-gray-200 bg-white' : 'border-amber-300 bg-amber-50'}`}>
                <p className="text-xs font-black text-gray-800">
                  Los precios del archivo ¿ya incluyen el impuesto?
                  {!impuestoEnPrecio && <span className="ml-2 text-amber-700">· hay que contestar para importar</span>}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <button type="button" onClick={() => setImpuestoEnPrecio('aparte')} disabled={importing}
                    className={`text-left px-3 py-2 rounded-lg border-2 transition ${
                      impuestoEnPrecio === 'aparte' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'}`}>
                    <span className="block text-xs font-black text-gray-900">No, el impuesto se añade</span>
                    <span className="block text-[11px] text-gray-500">
                      El precio del archivo es la base y el sistema le suma el IVA al vender. Se guardan tal cual.
                    </span>
                  </button>
                  <button type="button" onClick={() => setImpuestoEnPrecio('incluido')} disabled={importing}
                    className={`text-left px-3 py-2 rounded-lg border-2 transition ${
                      impuestoEnPrecio === 'incluido' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'}`}>
                    <span className="block text-xs font-black text-gray-900">Sí, ya está incluido</span>
                    <span className="block text-[11px] text-gray-500">
                      El precio del archivo es el final que paga el cliente. Se le resta el IVA de cada fila para
                      guardar la base, y al vender vuelve a quedar en el mismo precio.
                    </span>
                  </button>
                </div>
                {impuestoEnPrecio === 'incluido' && rows[0] && (
                  <p className="text-[11px] text-emerald-700 font-bold mt-1.5">
                    Ejemplo con la primera fila: ₡{miles(Number(rows[0].unit_price ?? 0))} del archivo
                    {' '}→ ₡{miles(precioNeto(rows[0].unit_price, rows[0].iva_rate))} de base
                    {' '}(IVA {rows[0].iva_rate ?? 13}%), y se vende otra vez a ₡{miles(Number(rows[0].unit_price ?? 0))}.
                  </p>
                )}
              </div>

              {/* ASIGNAR CABYS a lo que no lo trae. Sin esto, el cliente nuevo
                  queda sin poder emitir comprobantes electrónicos y el problema
                  aparece semanas después, sin relación visible con el alta. */}
              {/* El panel sigue a la vista mientras haya algo que revisar.
                  Antes desaparecía en cuanto todas las filas tenían código, y
                  con él se iba el botón de deshacer: quien sugería para un
                  catálogo entero se quedaba sin forma de echar atrás 540
                  códigos que todavía no había revisado. */}
              {(sinCabys > 0 || sugeridas > 0 || marcadas.size > 0) && (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2.5 space-y-2">
                  {/* Con filas marcadas el panel habla de ESAS: si dijera
                      «340 filas sin CABYS» mientras hay 12 marcadas, el
                      código se aplicaría a un grupo distinto del que se lee. */}
                  <p className="text-xs font-black text-gray-800">
                    {marcadas.size > 0
                      ? `${marcadas.size} fila(s) marcadas — elegí abajo el CABYS que les va a quedar a todas.`
                      : sinCabys > 0
                        ? `${sinCabys} fila(s) sin CABYS — sin él, el negocio no va a poder facturar electrónicamente.`
                        : `${sugeridas} fila(s) tomaron un CABYS sugerido — revisalos antes de importar.`}
                  </p>
                  {marcadas.size > 0 && (
                    <button type="button" onClick={() => setMarcadas(new Set())}
                      className="text-[11px] font-bold text-gray-500 underline hover:text-gray-700">
                      Desmarcar las {marcadas.size}
                    </button>
                  )}

                  <div className="relative">
                    <input value={cabysQuery} onChange={e => void buscarCabys(e.target.value)}
                      placeholder="Buscar un CABYS por descripción o código (ej. «comida preparada», «tornillo»)…"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-amber-500" />
                    {buscandoCabys && <span className="absolute right-3 top-2.5 text-[10px] text-gray-400">buscando…</span>}
                  </div>

                  {cabysResultados.length > 0 && (
                    <div className="max-h-44 overflow-y-auto border border-amber-200 rounded-lg bg-white divide-y divide-gray-100">
                      {cabysResultados.map(c => (
                        <button key={c.code} type="button"
                          onClick={() => aplicarCabys(c.code, c.iva_rate)}
                          className="w-full text-left px-3 py-2 hover:bg-amber-50">
                          <span className="font-mono text-[11px] font-bold text-gray-800">{c.code}</span>
                          {c.iva_rate != null && (
                            <span className="ml-2 text-[10px] font-bold text-gray-500">IVA {c.iva_rate}%</span>
                          )}
                          <span className="block text-[11px] text-gray-600">{c.description}</span>
                          <span className="block text-[10px] font-bold text-amber-700 mt-0.5">
                            {marcadas.size > 0
                              ? `Aplicar a las ${marcadas.size} filas marcadas`
                              : `Aplicar a las ${sinCabys} filas sin CABYS`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => void traerSugerencias()} disabled={sugiriendo || importing}
                      className="px-3 py-1.5 rounded-lg border-2 border-gray-300 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                      {sugiriendo
                        ? (progresoSug && progresoSug.total > 100
                            ? `Buscando… ${Math.min(progresoSug.hechos + 100, progresoSug.total)} de ${progresoSug.total}`
                            : 'Buscando…')
                        : `Sugerir por nombre (${sinCabys})`}
                    </button>
                    {sugeridas > 0 && (
                      <button type="button" onClick={quitarSugerencias} disabled={importing}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-500 hover:bg-white">
                        Quitar las {sugeridas} sugerencias
                      </button>
                    )}
                    <span className="text-[11px] text-gray-600">
                      Lo más rápido es elegir un código arriba y aplicarlo a todas: un restaurante suele usar uno
                      solo para todo el menú.
                    </span>
                  </div>
                </div>
              )}

              {sugeridas > 0 && (
                <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-[11px] text-gray-700">
                  <b className="text-amber-700">Revisá las {sugeridas} sugerencias.</b> Primero se busca entre los
                  productos que OTROS negocios ya clasificaron —ahí están los platos, que el catálogo de Hacienda no
                  tiene: «Casado con pollo» sale de otro restaurante, no de una descripción de aduana— y si no hay
                  parecido se cae al catálogo. Igual se equivocan: en la tabla va de dónde salió cada una y la
                  descripción del código
                  {!archivoTraeIva && <> y, como el archivo no trae columna de IVA, <b>la tarifa también sale del
                  catálogo</b>: un código equivocado le cambia el impuesto que cobra el negocio</>}.
                </div>
              )}

              {cabysPorNombre > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
                  <b>{cabysPorNombre} fila(s) sin CABYS</b> tomaron el del producto que ya existe, emparejando por
                  nombre. Van marcadas en la tabla: si alguna no corresponde, corregila en el archivo antes de importar.
                </div>
              )}

              {/* Qué columna se reconoció como qué. Se muestra ANTES de importar
                  porque descubrir que el costo entró en la columna equivocada
                  después de crear 300 productos es mucho más caro que revisarlo acá. */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px]">
                <p className="font-black text-gray-600 uppercase tracking-wide mb-1">Columnas reconocidas</p>
                <p className="text-gray-700">
                  {mapping.reconocidas.length > 0 ? mapping.reconocidas.join(' · ') : 'Ninguna'}
                </p>
                {mapping.ignoradas.length > 0 && (
                  <p className="text-amber-700 mt-1">
                    <b>Ignoradas:</b> {mapping.ignoradas.join(' · ')} — esas columnas no se importan.
                  </p>
                )}
                {!mapping.reconocidas.includes('cost_price') && (
                  <p className="text-gray-500 mt-1">
                    Sin columna de costo: los productos quedan con costo <b>0</b>, no con un valor inventado.
                  </p>
                )}
              </div>

              {/* Filtros: con 500 filas, lo que importa son las que fallan. */}
              {(() => {
                const cuenta = {
                  todas: rows.length,
                  sin_cabys: rows.filter(r => !r.cabys_code).length,
                  avisos: rows.filter(r => r._warn).length,
                  errores: rows.filter(r => r._error).length,
                };
                const botones: Array<[typeof filtroFilas, string, number]> = [
                  ['todas', 'Todas', cuenta.todas],
                  ['sin_cabys', 'Sin CABYS', cuenta.sin_cabys],
                  ['avisos', 'Con aviso', cuenta.avisos],
                  ['errores', 'Con error', cuenta.errores],
                ];
                return (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {botones.map(([clave, etiqueta, n]) => (
                      <button key={clave} type="button"
                        onClick={() => { setFiltroFilas(clave); setTope(100); }}
                        disabled={n === 0 && clave !== 'todas'}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                          filtroFilas === clave
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40'}`}>
                        {etiqueta} ({n})
                      </button>
                    ))}
                  </div>
                );
              })()}

              <div className="overflow-x-auto border border-gray-200 rounded-xl max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">
                        {/* Marca o desmarca TODO lo que el filtro deja ver. Con
                            el filtro «Sin CABYS» puesto, este check es el camino
                            corto: marca las que faltan y nada más. */}
                        <input
                          type="checkbox"
                          aria-label={todasDelFiltroMarcadas ? 'Desmarcar las filas que se ven' : 'Marcar las filas que se ven'}
                          title={`${todasDelFiltroMarcadas ? 'Desmarcar' : 'Marcar'} las ${indicesDelFiltro.length} filas que se ven`}
                          checked={todasDelFiltroMarcadas}
                          ref={el => { if (el) el.indeterminate = !todasDelFiltroMarcadas && algunaDelFiltroMarcada; }}
                          onChange={alternarTodasDelFiltro}
                          className="w-4 h-4 accent-emerald-600 cursor-pointer align-middle"
                        />
                      </th>
                      <th className="px-2 py-2 text-left font-bold text-gray-600">#</th>
                      <th className="px-2 py-2 text-left font-bold text-gray-600">Nombre</th>
                      <th className="px-2 py-2 text-left font-bold text-gray-600">SKU</th>
                      <th className="px-2 py-2 text-left font-bold text-gray-600">SKU2</th>
                      <th className="px-2 py-2 text-right font-bold text-gray-600">Precio</th>
                      <th className="px-2 py-2 text-right font-bold text-gray-600">Costo</th>
                      <th className="px-2 py-2 text-right font-bold text-gray-600">Stock</th>
                      <th className="px-2 py-2 text-left font-bold text-gray-600">Proveedor</th>
                      <th className="px-2 py-2 text-left font-bold text-gray-600">Categoría</th>
                      <th className="px-2 py-2 text-left font-bold text-gray-600">Unidad</th>
                      <th className="px-2 py-2 text-left font-bold text-gray-600">CABYS</th>
                      <th className="px-2 py-2 text-right font-bold text-gray-600">IVA</th>
                      <th className="px-2 py-2 text-left font-bold text-gray-600">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filasVisibles.map(({ r, i }) => (
                      <tr key={i} className={
                        marcadas.has(i) ? 'bg-emerald-50' : r._error ? 'bg-red-50' : ''}>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={marcadas.has(i)}
                            onChange={() => alternarFila(i)}
                            aria-label={`Marcar ${r.name || `la fila ${i + 1}`}`}
                            className="w-4 h-4 accent-emerald-600 cursor-pointer align-middle" />
                        </td>
                        <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                        {/* Con el modal ancho el nombre puede usar el espacio: recortarlo a 192px
                            desperdiciaba la pantalla grande. */}
                        <td className="px-2 py-1.5 font-semibold text-gray-800 truncate max-w-48 xl:max-w-96">{r.name || '—'}</td>
                        <td className="px-2 py-1.5 font-mono text-gray-500">{r.sku || '—'}</td>
                        <td className="px-2 py-1.5 font-mono text-gray-500">{r.sku2 || '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          ₡{miles(precioNeto(r.unit_price, r.iva_rate))}
                          {impuestoEnPrecio === 'incluido' && (
                            <span className="block text-[10px] text-gray-400">
                              archivo: ₡{Number(r.unit_price ?? 0).toLocaleString('es-CR')}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{r.cost_price != null ? `₡${r.cost_price.toLocaleString('es-CR')}` : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.tracks_stock === false ? '∞' : (r.stock_quantity ?? 0)}</td>
                        <td className="px-2 py-1.5 text-gray-600 truncate max-w-32">{r.supplier ?? '—'}</td>
                        <td className="px-2 py-1.5 text-gray-600 truncate max-w-32">{r.category ?? '—'}</td>
                        <td className="px-2 py-1.5 text-gray-600 truncate max-w-32">{r.unit_type ?? '—'}</td>
                        <td className="px-2 py-1.5 font-mono text-gray-500">
                          {r.cabys_code || <span className="text-amber-600">sin CABYS</span>}
                          {/* De un golpe, todas las filas que llevan ESTE mismo
                              código (o todas las que no llevan ninguno). Es
                              para cuando el código está mal en el grupo entero. */}
                          {(cuantasPorCabys.get(r.cabys_code ?? '') ?? 0) > 1 && (
                            <button type="button" onClick={() => marcarLasIguales(i)}
                              title={r.cabys_code
                                ? `Marcar las ${cuantasPorCabys.get(r.cabys_code)} filas que van con ${r.cabys_code}`
                                : `Marcar las ${cuantasPorCabys.get('')} filas sin CABYS`}
                              className="block text-[10px] font-sans font-bold text-emerald-700 underline hover:text-emerald-900">
                              marcar las {cuantasPorCabys.get(r.cabys_code ?? '')} iguales
                            </button>
                          )}
                          {r._cabys_heredado && (
                            <span className="block text-[10px] font-sans text-blue-600" title="No venía en el archivo: se tomó del producto que ya existe, emparejando por nombre">
                              del producto existente
                            </span>
                          )}
                          {r._cabys_asignado === 'manual' && (
                            /* Decía siempre «aplicado a todas», que era cierto
                               solo para el buscador de arriba. Con la búsqueda
                               por fila hay que distinguir: una etiqueta que
                               miente sobre el alcance del cambio es peor que
                               no tener etiqueta. */
                            <span className="block text-[10px] font-sans text-gray-500"
                              title={r._cabys_desc ?? undefined}>
                              {r._cabys_origen === 'buscado a mano' ? 'buscado para esta fila'
                                : r._cabys_origen === 'elegida de las opciones' ? 'elegido entre las opciones'
                                : r._cabys_origen === 'elegido para las marcadas' ? 'puesto a las marcadas'
                                : 'aplicado a todas'}
                            </span>
                          )}
                          {r._cabys_asignado === 'sugerido' && (
                            <span className="block text-[10px] font-sans text-amber-700" title={r._cabys_motivo ?? r._cabys_desc}>
                              {String(r._cabys_desc ?? '').slice(0, 38)}
                              {r._cabys_origen && (
                                <span className="block text-gray-500">{r._cabys_origen}</span>
                              )}
                            </span>
                          )}
                          {/* LAS OTRAS OPCIONES, donde no alcanzó a decidir.
                              Sin esto, un producto sin código deja a la
                              persona buscando a mano entre veinte mil filas;
                              con esto, es elegir entre tres. No se asigna
                              nada solo: el código equivocado lo paga el
                              negocio ante Hacienda, así que lo elige alguien. */}
                          {!r.cabys_code && r._cabys_alternativas?.length ? (
                            <span className="block mt-1 font-sans">
                              {r._cabys_motivo && (
                                <span className="block text-[9px] text-gray-500 mb-0.5">{r._cabys_motivo}</span>
                              )}
                              {r._cabys_alternativas.slice(0, 3).map(a => (
                                <button key={a.code}
                                  onClick={() => setRows(prev => prev.map(x => x === r ? {
                                    ...x, cabys_code: a.code, _cabys_desc: a.description,
                                    _cabys_asignado: 'manual' as const,
                                    _cabys_origen: 'elegida de las opciones',
                                    iva_rate: (!archivoTraeIva && a.iva_rate != null) ? a.iva_rate : x.iva_rate,
                                  } : x))}
                                  title={a.description}
                                  className="block w-full text-left text-[10px] px-1.5 py-0.5 mb-0.5 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900">
                                  <span className="font-mono">{a.code}</span>{' '}
                                  <span className="text-amber-700">{a.coincidencia}%</span>{' '}
                                  {String(a.description).slice(0, 30)}
                                </button>
                              ))}
                            </span>
                          ) : null}

                          {/* NINGUNA DE LAS TRES SIRVE.
                              Hasta acá se podía elegir entre las opciones o
                              dejar el producto sin código; el buscador de
                              arriba aplica a TODAS las filas, así que para el
                              producto raro de un catálogo largo no servía. */}
                          <span className="block mt-1 font-sans">
                            {filaBuscando === i ? (
                              <span className="block">
                                <input autoFocus value={filaQuery}
                                  onChange={e => void buscarParaFila(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Escape') { setFilaBuscando(null); setFilaQuery(''); setFilaResultados([]); } }}
                                  placeholder="Buscar CABYS por descripción o código…"
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-[10px] focus:outline-none focus:border-teal-500" />
                                {filaCargando && <span className="block text-[9px] text-gray-400 mt-0.5">buscando…</span>}
                                {!filaCargando && filaQuery.trim().length >= 2 && filaResultados.length === 0 && (
                                  <span className="block text-[9px] text-gray-400 mt-0.5">Sin resultados.</span>
                                )}
                                {filaResultados.length > 0 && (
                                  <span className="block mt-0.5 max-h-32 overflow-y-auto border border-gray-200 rounded bg-white">
                                    {filaResultados.map(c => (
                                      <button key={c.code} type="button"
                                        onClick={() => ponerCabysEnFila(i, c)}
                                        title={c.description}
                                        className="block w-full text-left px-1.5 py-1 hover:bg-teal-50 border-b border-gray-50">
                                        <span className="font-mono text-[10px] font-bold text-gray-800">{c.code}</span>
                                        {c.iva_rate != null && (
                                          <span className="ml-1 text-[9px] font-bold text-gray-500">IVA {c.iva_rate}%</span>
                                        )}
                                        <span className="block text-[9px] text-gray-600">{String(c.description).slice(0, 48)}</span>
                                      </button>
                                    ))}
                                  </span>
                                )}
                                <button type="button"
                                  onClick={() => { setFilaBuscando(null); setFilaQuery(''); setFilaResultados([]); }}
                                  className="mt-0.5 text-[9px] font-bold text-gray-400 hover:text-gray-600">
                                  Cancelar
                                </button>
                              </span>
                            ) : (
                              <button type="button"
                                onClick={() => { setFilaBuscando(i); setFilaQuery(''); setFilaResultados([]); }}
                                className="text-[10px] font-bold text-teal-700 hover:underline">
                                {r.cabys_code ? 'Cambiar este código…' : 'Ninguna sirve — buscar otro…'}
                              </button>
                            )}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.iva_rate ?? 13}%</td>
                        <td className="px-3 py-1.5">
                          {r._error ? (
                            <span className="text-red-600 text-[10px]">{r._error}</span>
                          ) : r._warn ? (
                            // Se importa igual, pero el usuario tiene que verlo:
                            // una corrección silenciosa es tan mala como el error.
                            <span className="text-amber-700 text-[10px]" title={r._warn}>⚠ {r._warn}</span>
                          ) : (
                            <CheckCircle2 size={12} className="text-emerald-500" />
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtradas.length > filasVisibles.length && (
                      <tr><td colSpan={14} className="px-2 py-2 text-center">
                        <button type="button" onClick={() => setTope(t => t + 200)}
                          className="px-2 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50">
                          Ver 200 más ({filtradas.length - filasVisibles.length} sin mostrar)
                        </button>
                        <button type="button" onClick={() => setTope(filtradas.length)}
                          className="ml-2 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100">
                          Ver todas
                        </button>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {importing && (() => {
                const pct = Math.min(100, Math.round((progress.done / Math.max(progress.total, 1)) * 100));
                return (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Loader2 size={14} className="animate-spin text-emerald-600 shrink-0" />
                      <span className="text-sm font-black text-emerald-800">
                        Importando {progress.done.toLocaleString('es-CR')} de {progress.total.toLocaleString('es-CR')}
                      </span>
                      <span className="text-sm font-black text-emerald-700 tabular-nums">· {pct}%</span>
                      {progress.errors > 0 && (
                        <span className="text-xs font-bold text-red-600 ml-auto">{progress.errors} sin subir</span>
                      )}
                    </div>
                    <div className="h-2.5 bg-emerald-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                        style={{ width: `${pct}%` }} />
                    </div>
                    {/* Un archivo grande tarda minutos: sin este aviso, la gente
                        cierra la ventana creyendo que se colgó y la carga queda
                        a medias. */}
                    <p className="mt-2 text-[11px] font-bold text-emerald-700">
                      No cierres esta ventana hasta que termine.
                      {progress.total > 500 && ' Un catálogo grande puede tardar varios minutos.'}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} disabled={importing}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {importing ? 'Cancelar' : 'Cerrar'}
          </button>
          <button onClick={doImport}
            disabled={validRows.length === 0 || importing || !impuestoEnPrecio}
            title={!impuestoEnPrecio ? 'Primero contestá si los precios ya incluyen el impuesto' : undefined}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-1.5">
            {importing ? (<><Loader2 size={14} className="animate-spin" /> Importando…</>) :
                         (<><Upload size={14} /> Importar {validRows.length} producto{validRows.length !== 1 ? 's' : ''}</>)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkProductImportModal;
