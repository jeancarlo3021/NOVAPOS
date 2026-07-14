// Búsqueda tolerante a errores (por similitud de caracteres) y por tokens.
// Ej: "carturlina roja" encuentra "cartolina zatinada roja".
//
// Reglas:
//  · La consulta se parte en palabras (tokens); TODAS deben coincidir (AND).
//  · Cada token coincide si es substring del texto, o si se parece a alguna
//    palabra del texto (distancia de edición dentro de un umbral por largo).
//  · Tokens con dígitos (SKU/códigos de barras) exigen coincidencia exacta de
//    substring — así "1001" no trae "1002".

/** minúsculas + sin acentos. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Distancia de Levenshtein acotada: corta apenas supera `max` (rápido). */
function boundedLevenshtein(a: string, b: string, max: number): number {
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  let prev = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    const cur = new Array<number>(bl + 1);
    cur[0] = i;
    let best = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[bl];
}

/** Errores tolerados según el largo del token. */
function maxEdits(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 8) return 2;
  return 3;
}

/**
 * ¿El texto coincide con la consulta (por token + similitud)?
 * Pasá los campos buscables (nombre, sku, sku2, descripción…).
 */
export function fuzzyMatch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalizeText(query).trim();
  if (!q) return true;
  const text = normalizeText(fields.filter(Boolean).join(' '));
  if (!text) return false;

  const words = text.split(/\s+/).filter(Boolean);
  const tokens = q.split(/\s+/).filter(Boolean);

  return tokens.every((tok) => {
    if (text.includes(tok)) return true;          // substring en cualquier parte
    if (/\d/.test(tok)) return false;             // códigos: solo substring exacto
    const md = maxEdits(tok.length);
    if (md === 0) return false;
    return words.some((w) => boundedLevenshtein(tok, w, md) <= md);
  });
}
