import { supabase } from '@/lib/supabase';

export type BucketName = 'logos' | 'products';

interface UploadOptions {
  upsert?: boolean;
  cacheControl?: string;
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
        img.onerror = () => reject(new Error('Imagen inválida'));
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
    const ext = 'jpg';  // Siempre comprimimos a JPEG
    const finalName = fileName ?? `${Date.now()}`;
    const path = `${tenantId}/${finalName}.${ext}`;
    return this.upload(bucket, path, compressed);
  },
};
