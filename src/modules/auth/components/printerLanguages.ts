/**
 * Catálogo de lenguajes de impresora POS.
 * Cada entrada sabe cómo envolver un texto plano en su protocolo nativo
 * (init + cuerpo + finalizador / cut / form feed según corresponda).
 */

export type PrinterFamily = 'thermal' | 'matrix' | 'label' | 'portable' | 'raw';

export interface PrinterLanguage {
  id: string;
  label: string;
  family: PrinterFamily;
  vendors: string;
  description: string;
  wrap: (text: string) => Uint8Array;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const enc = new TextEncoder();

function bytes(...parts: (number[] | Uint8Array | string)[]): Uint8Array {
  const all: number[] = [];
  for (const p of parts) {
    if (typeof p === 'string') enc.encode(p).forEach(b => all.push(b));
    else if (p instanceof Uint8Array) p.forEach(b => all.push(b));
    else all.push(...p);
  }
  return new Uint8Array(all);
}

// ── Encoders single-byte para impresoras térmicas ──────────────────────────
// Las impresoras ESC/POS NO entienden UTF-8 por defecto. Cada carácter Unicode
// no-ASCII debe traducirse al byte equivalente en su code page activo. Si
// mandamos UTF-8 (la "ó" es C3 B3), el firmware lo interpreta como caracteres
// multi-byte (a menudo chinos) y sale basura.
//
// CP437 = IBM PC original, universal. CP858 = Latin-9, soporta € y acentos.

const CP437_MAP: Record<string, number> = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86,
  'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8A, 'ï': 0x8B, 'î': 0x8C, 'ì': 0x8D,
  'Ä': 0x8E, 'Å': 0x8F, 'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93, 'ö': 0x94,
  'ò': 0x95, 'û': 0x96, 'ù': 0x97, 'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9A, '¢': 0x9B,
  '£': 0x9C, '¥': 0x9D, '₧': 0x9E, 'ƒ': 0x9F, 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2,
  'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ª': 0xA6, 'º': 0xA7, '¿': 0xA8, '¬': 0xAA,
  '½': 0xAB, '¼': 0xAC, '¡': 0xAD, '«': 0xAE, '»': 0xAF,
  '°': 0xF8, '·': 0xFA, '²': 0xFD, '■': 0xFE,
};

const CP858_MAP: Record<string, number> = {
  // Igual que CP437 pero con € en 0xD5 y algunas letras adicionales (CP850/858).
  ...CP437_MAP,
  '€': 0xD5,
  'Á': 0xB5, 'Í': 0xD6, 'Ó': 0xE0, 'Ú': 0xE9,
  'Ï': 0xD8, 'Ì': 0xDE,
  'Ô': 0xE2, 'Ò': 0xE3, 'Ù': 0xEB,
  'Â': 0xB6, 'Ê': 0xD2, 'Î': 0xD7, 'Û': 0xEA,
  'Ã': 0xC6, 'ã': 0xC7, 'Õ': 0xE4, 'õ': 0xE5,
  'š': 0xF0, 'Š': 0xE7, 'ý': 0xEC, 'Ý': 0xED,
  'µ': 0xE6, '×': 0x9E,
};

function encodeWithMap(text: string, map: Record<string, number>): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);                       // ASCII puro
    } else if (map[ch] != null) {
      out.push(map[ch]);                    // mapeo single-byte
    } else {
      out.push(0x3F);                       // '?' para caracteres no soportados
    }
  }
  return new Uint8Array(out);
}

const encodeCP437 = (t: string) => encodeWithMap(t, CP437_MAP);
const encodeCP858 = (t: string) => encodeWithMap(t, CP858_MAP);

// ── Lenguajes ──────────────────────────────────────────────────────────────
export const PRINTER_LANGUAGES: PrinterLanguage[] = [
  // ── Térmicos directos ──────────────────────────────────────────────────
  {
    id: 'escpos',
    label: 'ESC/POS',
    family: 'thermal',
    vendors: 'Epson · Xprinter · Bixolon · 3nStar · clones chinos',
    description: 'El estándar de facto para impresoras térmicas de recibos. 90% del mercado lo habla.',
    wrap: (text) => bytes(
      [0x1B, 0x40],                  // ESC @  — init
      [0x1B, 0x74, 0x10],            // ESC t 16 — code page CP858 (Latin con €)
      text + '\n',
      [0x0A, 0x0A, 0x0A],            // feed 3 líneas
      [0x1D, 0x56, 0x00],            // GS V 0 — full cut
    ),
  },
  {
    id: 'xprinter-cn',
    label: 'Xprinter chino (cancela GB18030 + CP437)',
    family: 'thermal',
    vendors: 'Xprinter XP-58 · XP-80 · XP-T80 en modo chino de fábrica',
    description: 'Cancela modo chino y codifica texto en CP437 single-byte (NO UTF-8). Acentos básicos (á é í ó ú ñ) salen bien. Sin €.',
    wrap: (text) => bytes(
      [0x1B, 0x40],                  // ESC @ — init
      [0x1C, 0x2E],                  // FS . — CANCELAR modo chino (clave!)
      [0x1B, 0x52, 0x00],            // ESC R 0 — international charset: USA
      [0x1B, 0x74, 0x00],            // ESC t 0 — code page: CP437
      [0x1B, 0x21, 0x00],            // ESC ! 0 — modo normal
      encodeCP437(text + '\n'),      // ← TEXTO EN CP437, NO UTF-8
      [0x0A, 0x0A, 0x0A],
      [0x1D, 0x56, 0x00],            // GS V 0 — full cut
    ),
  },
  {
    id: 'xprinter-cn-cp858',
    label: 'Xprinter chino + CP858 (acentos €ñáé)',
    family: 'thermal',
    vendors: 'Xprinter chinas + textos con tildes, ñ y €',
    description: 'Cancela modo chino y codifica el texto en CP858 single-byte. Soporta TODAS las tildes (mayúsculas incluidas), ñ, ¿¡ y €.',
    wrap: (text) => bytes(
      [0x1B, 0x40],
      [0x1C, 0x2E],                  // FS . — cancel Chinese mode
      [0x1B, 0x52, 0x07],            // ESC R 7 — international: Spain
      [0x1B, 0x74, 0x13],            // ESC t 19 — CP858 (Latin con €)
      encodeCP858(text + '\n'),      // ← TEXTO EN CP858, NO UTF-8
      [0x0A, 0x0A, 0x0A],
      [0x1D, 0x56, 0x00],
    ),
  },
  {
    id: 'escpos-cp858',
    label: 'ESC/POS estándar + CP858 (recomendado)',
    family: 'thermal',
    vendors: 'Cualquier impresora ESC/POS con acentos',
    description: 'Versión "correcta" para impresoras ya en modo Latin. CP858 single-byte + ESC R 7. Sin FS . (no necesita cancelar chino).',
    wrap: (text) => bytes(
      [0x1B, 0x40],
      [0x1B, 0x52, 0x07],            // ESC R 7 — internacional: España
      [0x1B, 0x74, 0x13],            // ESC t 19 — CP858
      encodeCP858(text + '\n'),
      [0x0A, 0x0A, 0x0A],
      [0x1D, 0x56, 0x00],
    ),
  },
  {
    id: 'escpos-partial',
    label: 'ESC/POS (corte parcial)',
    family: 'thermal',
    vendors: 'Epson TM · Xprinter modelos con corte parcial',
    description: 'Igual que ESC/POS pero usa corte parcial (deja unida una esquina). Útil para no perder recibos.',
    wrap: (text) => bytes(
      [0x1B, 0x40],
      text + '\n',
      [0x0A, 0x0A, 0x0A],
      [0x1D, 0x56, 0x01],            // GS V 1 — partial cut
    ),
  },
  {
    id: 'escpos-feed-cut',
    label: 'ESC/POS (cut + feed n)',
    family: 'thermal',
    vendors: 'Epson TM-T20 · TM-T88',
    description: 'Variante moderna: GS V B + n líneas de avance antes del corte. Recomendada Epson TM nuevos.',
    wrap: (text) => bytes(
      [0x1B, 0x40],
      text + '\n',
      [0x1D, 0x56, 0x42, 0x05],      // GS V B 5 — feed 5 lines and full cut
    ),
  },

  // ── Star Micronics ─────────────────────────────────────────────────────
  {
    id: 'star-line',
    label: 'Star Line Mode',
    family: 'thermal',
    vendors: 'Star TSP100 · TSP650 · TSP700 (modo legado)',
    description: 'Modo legacy de Star. ESC d 3 para cortar + avanzar. NO es ESC/POS aunque sea parecido.',
    wrap: (text) => bytes(
      [0x1B, 0x40],                  // ESC @ — init
      text + '\n',
      [0x1B, 0x64, 0x03],            // ESC d 3 — feed + full cut
    ),
  },
  {
    id: 'star-prnt',
    label: 'Star PRNT (StarPRNT)',
    family: 'thermal',
    vendors: 'Star TSP100III · TSP700II · mPOP',
    description: 'Lenguaje moderno de Star. Init extendido + corte. Modelos nuevos vienen configurados así.',
    wrap: (text) => bytes(
      [0x1B, 0x1D, 0x40],            // ESC GS @ — init StarPRNT
      text + '\n',
      [0x1B, 0x64, 0x02],            // ESC d 2 — feed + full cut
    ),
  },
  {
    id: 'star-cbm',
    label: 'Star/CBM ESC/POS-like',
    family: 'thermal',
    vendors: 'Citizen CBM · Star compatibles ESC/POS',
    description: 'Star/Citizen en modo emulación ESC/POS. Usar si el modelo permite "ESC/POS mode".',
    wrap: (text) => bytes(
      [0x1B, 0x40],
      text + '\n',
      [0x1D, 0x56, 0x41, 0x10],      // GS V A 16
    ),
  },

  // ── Citizen ────────────────────────────────────────────────────────────
  {
    id: 'citizen',
    label: 'Citizen Command Set',
    family: 'thermal',
    vendors: 'Citizen CT-S310II · CT-E351 (modo nativo)',
    description: 'Variante con cut command propietario. Solo si la impresora NO está en modo ESC/POS.',
    wrap: (text) => bytes(
      [0x1B, 0x40],
      text + '\n',
      [0x0A, 0x0A, 0x0A],
      [0x1B, 0x69],                  // ESC i — Citizen partial cut
    ),
  },

  // ── ESC/P (matriciales) ────────────────────────────────────────────────
  {
    id: 'escp',
    label: 'ESC/P (Epson matricial)',
    family: 'matrix',
    vendors: 'Epson LX-300 · FX-890 · TM-U220 (impacto)',
    description: 'Epson Standard Code for Printers — matriciales de impacto. Usa form-feed para sacar la página.',
    wrap: (text) => bytes(
      [0x1B, 0x40],                  // ESC @ — init
      text + '\n',
      [0x0C],                        // FF — form feed (eject)
    ),
  },
  {
    id: 'escp2',
    label: 'ESC/P2',
    family: 'matrix',
    vendors: 'Epson 24-pin matriciales modernas',
    description: 'Extensión de ESC/P con más fonts y bitmaps. Compatible con la mayoría de drivers Epson.',
    wrap: (text) => bytes(
      [0x1B, 0x40],
      [0x1B, 0x21, 0x00],            // ESC ! 0 — modo normal
      text + '\n',
      [0x0C],
    ),
  },

  // ── Etiquetas (label printers) ─────────────────────────────────────────
  {
    id: 'zpl',
    label: 'ZPL II (Zebra)',
    family: 'label',
    vendors: 'Zebra ZD220 · GK420 · ZT230',
    description: 'Zebra Programming Language. Texto formateado como tag ^FD…^FS. Imprime una etiqueta.',
    wrap: (text) => bytes(
      `^XA\n` +                      // start of label
      `^CI28\n` +                    // UTF-8
      `^LH0,0\n` +
      text.split('\n').map((line, i) =>
        `^FO40,${40 + i * 40}^A0N,30,30^FD${line}^FS`
      ).join('\n') + '\n' +
      `^XZ\n`                        // end of label
    ),
  },
  {
    id: 'epl2',
    label: 'EPL2 (Eltron/Zebra legacy)',
    family: 'label',
    vendors: 'Zebra TLP2844 · LP2824 · Eltron antiguos',
    description: 'Lenguaje de Eltron (heredado por Zebra). Sintaxis A,B,C,font,h,v,reverse,"text".',
    wrap: (text) => bytes(
      `N\n` +                        // clear buffer
      text.split('\n').map((line, i) =>
        `A50,${50 + i * 30},0,2,1,1,N,"${line.replace(/"/g, '\\"')}"`
      ).join('\n') + '\n' +
      `P1\n`                         // print 1 copy
    ),
  },
  {
    id: 'tspl',
    label: 'TSPL/TSPL2 (TSC)',
    family: 'label',
    vendors: 'TSC TE200 · TTP-244 · DA210',
    description: 'TSC Printer Language. Define tamaño, gap, limpia buffer, imprime.',
    wrap: (text) => bytes(
      `SIZE 80 mm,40 mm\n` +
      `GAP 2 mm,0\n` +
      `CLS\n` +
      text.split('\n').map((line, i) =>
        `TEXT 50,${50 + i * 30},"3",0,1,1,"${line.replace(/"/g, '\\"')}"`
      ).join('\n') + '\n' +
      `PRINT 1\n`
    ),
  },
  {
    id: 'dpl',
    label: 'DPL (Datamax)',
    family: 'label',
    vendors: 'Datamax · Honeywell M-Class · I-Class',
    description: 'Datamax Programming Language. STX/CR/ETX framing — sintaxis vieja pero soportada.',
    wrap: (text) => bytes(
      `\x02L\r`,                     // STX L — start label
      text.split('\n').map((line, i) =>
        `1911A00${(50 + i * 30).toString().padStart(4, '0')}0050${line}\r`
      ).join(''),
      `Q0001\r`,                     // quantity 1
      `E\r`,                          // end / print
    ),
  },

  // ── Portátiles ─────────────────────────────────────────────────────────
  {
    id: 'cpcl',
    label: 'CPCL (Zebra portátiles)',
    family: 'portable',
    vendors: 'Zebra ZQ110 · ZQ220 · QL220 · iMZ220',
    description: 'Comtec Printer Command Language. Para impresoras móviles Bluetooth de Zebra.',
    wrap: (text) => bytes(
      `! 0 200 200 ${100 + text.split('\n').length * 30} 1\n` +
      text.split('\n').map((line, i) =>
        `TEXT 4 0 30 ${30 + i * 30} ${line}`
      ).join('\n') + '\n' +
      `FORM\nPRINT\n`
    ),
  },

  // ── Sin códigos ────────────────────────────────────────────────────────
  {
    id: 'plain',
    label: 'Texto plano (sin códigos)',
    family: 'raw',
    vendors: 'cualquier impresora',
    description: 'Solo manda bytes UTF-8 del texto. Útil para identificar si la impresora interpreta el texto crudo.',
    wrap: (text) => bytes(text + '\n'),
  },
  {
    id: 'plain-cp437',
    label: 'Texto plano CP437 (ASCII extendido)',
    family: 'raw',
    vendors: 'impresoras viejas en inglés',
    description: 'Texto sin códigos, sustituyendo caracteres latinos por ASCII puro. Para impresoras sin soporte UTF-8.',
    wrap: (text) => {
      const ascii = text
        .replace(/[áàâä]/gi, 'a')
        .replace(/[éèêë]/gi, 'e')
        .replace(/[íìîï]/gi, 'i')
        .replace(/[óòôö]/gi, 'o')
        .replace(/[úùûü]/gi, 'u')
        .replace(/ñ/g, 'n')
        .replace(/Ñ/g, 'N')
        .replace(/[¿¡]/g, '');
      return bytes(ascii + '\n');
    },
  },
];

export const LANGUAGE_BY_ID: Record<string, PrinterLanguage> =
  Object.fromEntries(PRINTER_LANGUAGES.map(l => [l.id, l]));
