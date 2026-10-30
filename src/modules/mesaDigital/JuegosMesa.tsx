import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * JUEGOS PARA LA ESPERA.
 *
 * No es un adorno: la queja más común en un restaurante es la espera, y una
 * mesa con niños aburridos la siente el doble. Son dos juegos que se entienden
 * sin instrucciones y funcionan sin internet una vez abierta la página.
 */

type Juego = 'gato' | 'memoria';

export const JuegosMesa: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [juego, setJuego] = useState<Juego>('gato');
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Link to={`/mesa/${token}`} aria-label="Volver a la mesa"
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="font-black text-gray-900">Juegos</h1>
      </header>

      <div className="max-w-md mx-auto p-4">
        <div className="flex gap-2 mb-4">
          {([['gato', '❌⭕ Gato'], ['memoria', '🧠 Memoria']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setJuego(id)}
              className={`flex-1 h-11 rounded-xl font-bold text-sm border-2 transition ${
                juego === id ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
        {juego === 'gato' ? <Gato /> : <Memoria />}
      </div>
    </div>
  );
};

/* ── Gato (tres en raya) contra la máquina ───────────────────────────────── */

const LINEAS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
type Casilla = 'X' | 'O' | null;

const ganador = (b: Casilla[]): Casilla | 'empate' | null => {
  for (const [a, c, d] of LINEAS) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'empate' : null;
};

/** Gana si puede, bloquea si debe; si no, el centro y después al azar. */
const jugadaMaquina = (b: Casilla[]): number => {
  const libres = b.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
  for (const marca of ['O', 'X'] as const) {
    for (const i of libres) {
      const t = [...b]; t[i] = marca;
      if (ganador(t) === marca) return i;
    }
  }
  if (b[4] === null) return 4;
  return libres[Math.floor(Math.random() * libres.length)];
};

const Gato: React.FC = () => {
  const [tablero, setTablero] = useState<Casilla[]>(Array(9).fill(null));
  const [marcador, setMarcador] = useState({ vos: 0, maquina: 0 });
  const fin = ganador(tablero);

  useEffect(() => {
    if (fin === 'X') setMarcador(m => ({ ...m, vos: m.vos + 1 }));
    else if (fin === 'O') setMarcador(m => ({ ...m, maquina: m.maquina + 1 }));
  }, [fin]);

  const jugar = (i: number) => {
    if (tablero[i] || fin) return;
    const mio = [...tablero];
    mio[i] = 'X';
    if (ganador(mio)) { setTablero(mio); return; }
    mio[jugadaMaquina(mio)] = 'O';
    setTablero(mio);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
      <p className="text-sm font-bold text-gray-500 mb-3">
        Vos {marcador.vos} · {marcador.maquina} Máquina
      </p>
      <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
        {tablero.map((v, i) => (
          <button key={i} type="button" onClick={() => jugar(i)} aria-label={`Casilla ${i + 1}`}
            className="aspect-square rounded-xl bg-gray-50 border-2 border-gray-200 text-3xl font-black text-gray-800">
            {v === 'X' ? '❌' : v === 'O' ? '⭕' : ''}
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm font-black text-gray-900 min-h-6">
        {fin === 'X' ? '¡Ganaste! 🎉' : fin === 'O' ? 'Ganó la máquina 🤖' : fin === 'empate' ? 'Empate 🤝' : ''}
      </p>
      <button type="button" onClick={() => setTablero(Array(9).fill(null))}
        className="mt-2 h-11 px-5 rounded-xl bg-gray-900 text-white font-bold text-sm">
        Otra vez
      </button>
    </div>
  );
};

/* ── Memoria ─────────────────────────────────────────────────────────────── */

const FIGURAS = ['🍕', '🍔', '🌮', '🍰', '☕', '🥑', '🍹', '🧁'];

const barajar = (): string[] =>
  [...FIGURAS, ...FIGURAS]
    .map(v => ({ v, o: Math.random() }))
    .sort((a, b) => a.o - b.o)
    .map(x => x.v);

const Memoria: React.FC = () => {
  const [cartas, setCartas] = useState<string[]>(barajar);
  const [vueltas, setVueltas] = useState<number[]>([]);
  const [hechas, setHechas] = useState<number[]>([]);
  const [intentos, setIntentos] = useState(0);

  // Dos cartas distintas: se muestran un momento y se tapan solas.
  useEffect(() => {
    if (vueltas.length !== 2) return;
    const [a, b] = vueltas;
    setIntentos(n => n + 1);
    if (cartas[a] === cartas[b]) {
      setHechas(h => [...h, a, b]);
      setVueltas([]);
      return;
    }
    const t = setTimeout(() => setVueltas([]), 800);
    return () => clearTimeout(t);
  }, [vueltas, cartas]);

  const listo = hechas.length === cartas.length;

  const tocar = (i: number) => {
    if (vueltas.length === 2 || vueltas.includes(i) || hechas.includes(i)) return;
    setVueltas(v => [...v, i]);
  };

  const reiniciar = () => { setCartas(barajar()); setVueltas([]); setHechas([]); setIntentos(0); };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
      <p className="text-sm font-bold text-gray-500 mb-3">
        Intentos: {intentos}{listo ? ' · ¡Las encontraste todas! 🎉' : ''}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {cartas.map((v, i) => {
          const abierta = vueltas.includes(i) || hechas.includes(i);
          return (
            <button key={i} type="button" onClick={() => tocar(i)} aria-label={abierta ? v : 'Carta tapada'}
              className={`aspect-square rounded-xl text-2xl border-2 transition ${
                abierta ? 'bg-amber-50 border-amber-200' : 'bg-gray-100 border-gray-200'}`}>
              {abierta ? v : '❓'}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={reiniciar}
        className="mt-4 h-11 px-5 rounded-xl bg-gray-900 text-white font-bold text-sm">
        Barajar de nuevo
      </button>
    </div>
  );
};

export default JuegosMesa;
