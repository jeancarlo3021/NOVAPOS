import { supabase } from '@/lib/supabase';

export type BucketName = 'logos' | 'products';

interface UploadOptions {
  upsert?: boolean;
  cacheControl?: string;
}

/**
 * Primera página de un PDF → imagen.
 *
 * El logo suele llegar del diseñador en PDF, y el navegador no sabe dibujar un
 * PDF en un lienzo: hasta ahora había que pedirle al cliente que lo convirtiera
 * a PNG antes de subirlo, y muchos no saben cómo.
 *
 * Se dibuja al DOBLE del ancho final y después se reduce: un logo con letras
 * finas renderizado justo al tamaño sale con los bordes sucios, y en una
 * impresora térmica —que imprime a un solo color, sin grises— eso se convierte
 * en manchas.
 *
 * La librería se carga SOLO acá, cuando alguien sube un PDF. Pesa cerca de un
 * mega: cargarla siempre castigaría el arranque de todos por algo que se hace
 * una vez en la vida del negocio.
 */
async function pdfPrimeraPaginaAImagen(file: File, maxWidth: number, quality: number): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist');
  // El worker va desde el mismo paquete: sin esto la librería lo busca en una
  // dirección de internet que no existe en nuestro dominio y no renderiza nada.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  (pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await (pdfjs as any).getDocument({ data: await file.arrayBuffer() }).promise;
  if (doc.numPages < 1) throw new Error('El PDF está vacío.');
  const page = await doc.getPage(1);

  const base = page.getViewport({ scale: 1 });
  const escala = Math.min(4, (maxWidth * 2) / base.width);
  const viewport = page.getViewport({ scale: escala });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no soportado');
  // Fondo BLANCO: un PDF con fondo transparente sale negro sobre negro al
  // pasarlo a JPEG, y el logo se ve como un cuadro oscuro en el tiquete.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, background: '#ffffff' }).promise;

  // Reducción al tamaño final, ya con el dibujo nítido.
  const finalW = Math.min(maxWidth, canvas.width);
  const finalH = Math.round((finalW / canvas.width) * canvas.height);
  const out = document.createElement('canvas');
  out.width = finalW; out.height = finalH;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas no soportado');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, finalW, finalH);
  octx.drawImage(canvas, 0, 0, finalW, finalH);

  return await new Promise<Blob>((resolve, reject) => {
    out.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo convertir el PDF'))), 'image/jpeg', quality);
  });
}

/** Blob → base64 (sin el prefijo `data:`), que es lo que espera el servidor. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? '');
      resolve(s.slice(s.indexOf('base64,') + 7));
    };
    r.onerror = () => reject(new Error('No se pudo leer la imagen'));
    r.readAsDataURL(blob);
  });
}

export const storageService = {
  /**
   * Sube un archivo a un bucket de Storage
   * @param bucket - Nombre del bucket (logos | products)
   * @param path - Ruta dentro del bucket (debe empezar con tenant_id)
   * @param file - File o Blob a subir
   * @returns URL pública del archivo
   */
  async upload(
    bucket: BucketName,
    path: string,
    file: File | Blob,
    options: UploadOptions = {}
  ): Promise<string> {
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: options.cacheControl ?? '3600',
      upsert: options.upsert ?? true,
    });
    if (error) throw new Error(`Error al subir archivo: ${error.message}`);
    if (!data) throw new Error('No se recibió respuesta del Storage');
    return this.getPublicUrl(bucket, data.path);
  },

  /**
   * Obtiene la URL pública de un archivo (solo buckets públicos)
   */
  getPublicUrl(bucket: BucketName, path: string): string {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  /**
   * Elimina uno o varios archivos
   */
  async remove(bucket: BucketName, paths: string[]): Promise<void> {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw new Error(`Error al eliminar: ${error.message}`);
  },

  /**
   * Extrae el path desde una URL pública
   * Útil para borrar el archivo cuando se reemplaza
   */
  extractPathFromUrl(url: string, bucket: BucketName): string | null {
    const match = url.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)$`));
    return match ? match[1] : null;
  },

  /**
   * Comprime una imagen antes de subirla (reduce tamaño)
   * @param file - Archivo original
   * @param maxWidth - Ancho máximo (default 1024)
   * @param quality - Calidad JPEG 0-1 (default 0.85)
   */
  async compressImage(file: File, maxWidth = 1024, quality = 0.85): Promise<Blob> {
    // El logo puede venir en PDF: es como lo entrega el diseñador, y hasta ahora
    // había que pedirle al cliente que lo convirtiera a imagen antes de subirlo.
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      return pdfPrimeraPaginaAImagen(file, maxWidth, quality);
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, maxWidth / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas no soportado'));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir'))),
            'image/jpeg',
            quality
          );
        };
        // Formatos que el navegador no sabe dibujar en un lienzo: SVG sin
        // medidas, HEIC del iPhone, archivos dañados. El mensaje dice cuáles
        // sirven, porque «imagen inválida» deja al usuario probando la misma
        // foto una y otra vez.
        img.onerror = () => reject(new Error(
          'No se pudo leer esa imagen. Probá con un archivo PNG o JPG '
          + '(los SVG y las fotos HEIC del iPhone no sirven).',
        ));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Helper: sube imagen comprimida y retorna URL pública
   * @param bucket
   * @param tenantId - ID del tenant (para path)
   * @param file - Imagen original
   * @param fileName - Nombre opcional (sin extensión)
   */
  async uploadImage(
    bucket: BucketName,
    tenantId: string,
    file: File,
    fileName?: string
  ): Promise<string> {
    const compressed = await this.compressImage(file);

    /**
     * El LOGO lo sube el servidor, no el navegador.
     *
     * Subirlo directo desde el navegador dependía de que el bucket existiera y
     * de que sus permisos dejaran escribir en la carpeta del negocio. Cuando
     * algo de eso faltaba, el error era «new row violates row-level security
     * policy» —que no le dice nada a nadie— y el logo no subía. El servidor
     * puede crear el bucket y escribir siempre.
     */
    if (bucket === 'logos') {
      const { apiFetch } = await import('@/lib/api');
      const b64 = await blobToBase64(compressed);
      const r = await apiFetch<{ url: string }>('/shared-docs/logo', {
        method: 'POST',
        body: JSON.stringify({ content_base64: b64, content_type: 'image/jpeg' }),
      });
      if (!r?.url) throw new Error('El servidor no devolvió la dirección del logo');
      return r.url;
    }

    const ext = 'jpg';  // Siempre comprimimos a JPEG
    const finalName = fileName ?? `${Date.now()}`;
    const path = `${tenantId}/${finalName}.${ext}`;
    return this.upload(bucket, path, compressed);
  },
};
