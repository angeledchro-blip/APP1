// Pruebas con señales sintéticas de guitarra: detección de tono y de acordes.
// Correr con: npm test   (desde la carpeta web/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarTono } from '../public/js/tono.js';
import { cromaDesdeEspectro, evaluarAcorde, clasesDeAcorde, consejoAcorde } from '../public/js/acordes.js';
import { midiDeFrecuencia, frecuenciaDeMidi, LETRAS, parsearNotas } from '../public/js/musica.js';
import { ACORDES, LECCIONES } from '../src/seed.js';

const SR = 48000;

// Generador pseudoaleatorio con semilla para que las pruebas sean repetibles
function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Nota de guitarra sintética: armónicos que decaen, algo de inarmonicidad y ruido.
function notaGuitarra(midi, n, { inicio = 0, fundamental = 1, ruido = 0.01, semilla = 1, amp = 0.3 } = {}) {
  const rnd = azar(semilla + midi * 7);
  const f0 = frecuenciaDeMidi(midi);
  const out = new Float32Array(n);
  const B = 0.00008;
  for (let h = 1; h <= 12; h++) {
    const fh = h * f0 * Math.sqrt(1 + B * h * h);
    if (fh > SR / 2.2) break;
    let a = 1 / Math.pow(h, 1.1);
    if (h === 1) a *= fundamental;
    const fase = rnd() * Math.PI * 2;
    const decae = 1.5 + h * 0.4;
    for (let i = inicio; i < n; i++) {
      const t = (i - inicio) / SR;
      out[i] += amp * a * Math.sin(2 * Math.PI * fh * t + fase) * Math.exp(-decae * t);
    }
  }
  for (let i = 0; i < n; i++) out[i] += ruido * (rnd() * 2 - 1);
  return out;
}

function sumar(señales) {
  const n = señales[0].length;
  const out = new Float32Array(n);
  for (const s of señales) for (let i = 0; i < n; i++) out[i] += s[i];
  return out;
}

// FFT radix-2 en el lugar (para simular el AnalyserNode del navegador)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

// Magnitudes lineales con ventana Blackman (igual que AnalyserNode)
function espectro(señal, fftSize) {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const off = señal.length - fftSize;
  for (let i = 0; i < fftSize; i++) {
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / fftSize) + 0.08 * Math.cos((4 * Math.PI * i) / fftSize);
    re[i] = señal[off + i] * w;
  }
  fft(re, im);
  const mag = new Float32Array(fftSize / 2);
  for (let k = 0; k < fftSize / 2; k++) mag[k] = Math.hypot(re[k], im[k]) / fftSize;
  return mag;
}

function rasgueo(acorde, { semilla = 3, quitar = [], extra = [] } = {}) {
  const n = 16384 + 4096;
  const cuerdasMidi = [40, 45, 50, 55, 59, 64];
  const trastes = acorde.trastes.split(',');
  const notas = [];
  trastes.forEach((t, i) => {
    if (t !== 'x' && !quitar.includes(6 - i)) notas.push(cuerdasMidi[i] + Number(t));
  });
  for (const e of extra) notas.push(e);
  return sumar(
    notas.map((m, i) => notaGuitarra(m, n, { inicio: i * 240, semilla: semilla + i, amp: 0.18, ruido: 0.004 }))
  );
}

const acordesSeed = ACORDES.map(([id, nombre, trastes, dedos, cejilla]) => ({ id, nombre, trastes, dedos, cejilla }));
const porId = Object.fromEntries(acordesSeed.map((a) => [a.id, a]));

test('los acordes del contenido tienen las notas correctas', () => {
  const esperado = {
    Em: ['E', 'G', 'B'],
    Am: ['A', 'C', 'E'],
    E: ['E', 'G#', 'B'],
    A: ['A', 'C#', 'E'],
    D: ['D', 'F#', 'A'],
    Dm: ['D', 'F', 'A'],
    G: ['G', 'B', 'D'],
    C: ['C', 'E', 'G'],
    A7: ['A', 'C#', 'E', 'G'],
    E7: ['E', 'G#', 'B', 'D'],
    D7: ['D', 'F#', 'A', 'C'],
    G7: ['G', 'B', 'D', 'F'],
    C7: ['C', 'E', 'A#'], // la posición abierta x32310 no lleva la quinta (Sol)
    Fmaj7: ['F', 'A', 'C', 'E'],
    F: ['F', 'A', 'C'],
    Bm: ['B', 'D', 'F#'],
  };
  for (const a of acordesSeed) {
    const clases = clasesDeAcorde(a).map((pc) => LETRAS[pc]).sort();
    assert.deepEqual(clases, [...esperado[a.id]].sort(), `acorde ${a.id}`);
  }
});

test('las lecciones de notas solo usan trastes y cuerdas válidas', () => {
  for (const [id, , , notas] of LECCIONES) {
    for (const n of parsearNotas(notas)) {
      assert.ok(n.cuerda >= 1 && n.cuerda <= 6, `${id}: cuerda ${n.cuerda}`);
      assert.ok(n.traste >= 0 && n.traste <= 12, `${id}: traste ${n.traste}`);
    }
  }
});

test('detecta el tono de cuerdas al aire y notas pisadas (±10 cents)', () => {
  const casos = [40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 72, 76];
  for (const midi of casos) {
    for (const fundamental of [1, 0.35]) {
      const s = notaGuitarra(midi, 4096, { fundamental, ruido: 0.01, semilla: midi });
      const r = detectarTono(s, SR);
      assert.ok(r, `sin detección para midi ${midi} (fundamental ${fundamental})`);
      const cents = (midiDeFrecuencia(r.frecuencia) - midi) * 100;
      assert.ok(Math.abs(cents) < 10, `midi ${midi} fund ${fundamental}: ${cents.toFixed(1)} cents`);
    }
  }
});

test('detecta afinación ligeramente desviada', () => {
  for (const desv of [-30, -12, 8, 25]) {
    const f = frecuenciaDeMidi(45) * Math.pow(2, desv / 1200);
    const n = 4096;
    const s = new Float32Array(n);
    for (let h = 1; h <= 8; h++) for (let i = 0; i < n; i++) s[i] += (0.3 / h) * Math.sin((2 * Math.PI * f * h * i) / SR + h);
    const r = detectarTono(s, SR);
    const cents = (midiDeFrecuencia(r.frecuencia) - 45) * 100;
    assert.ok(Math.abs(cents - desv) < 3, `esperado ${desv}, salió ${cents.toFixed(1)}`);
  }
});

test('silencio o ruido no da nota', () => {
  const rnd = azar(9);
  const ruido = new Float32Array(4096).map(() => 0.05 * (rnd() * 2 - 1));
  assert.equal(detectarTono(ruido, SR), null);
});

test('reconoce cada acorde bien tocado', () => {
  for (const a of acordesSeed) {
    const s = rasgueo(a);
    const croma = cromaDesdeEspectro(espectro(s, 16384), SR, 16384);
    const ev = evaluarAcorde(croma, a);
    assert.ok(ev.coincide, `${a.id}: puntaje ${ev.puntaje.toFixed(3)}, faltan ${ev.faltan.map((f) => LETRAS[f.pc])}, parecido ${ev.parecido}`);
  }
});

test('no acepta un acorde distinto al pedido', () => {
  const pares = [
    ['Em', 'Am'], ['Am', 'Em'], ['E', 'Em'], ['Em', 'E'], ['A', 'Am'], ['Am', 'A'],
    ['G', 'Em'], ['C', 'Am'], ['D', 'Dm'], ['Dm', 'D'], ['G', 'C'], ['C', 'G'],
    ['E', 'E7'], ['A', 'A7'], ['D', 'D7'], ['Am', 'Fmaj7'], ['G', 'G7'], ['C', 'D'],
  ];
  for (const [tocado, pedido] of pares) {
    const s = rasgueo(porId[tocado], { semilla: 11 });
    const croma = cromaDesdeEspectro(espectro(s, 16384), SR, 16384);
    const ev = evaluarAcorde(croma, porId[pedido]);
    assert.equal(ev.coincide, false, `tocó ${tocado} y aceptó ${pedido} (puntaje ${ev.puntaje.toFixed(3)})`);
  }
});

test('avisa qué cuerda revisar si falta una nota', () => {
  // C sin la 5ª cuerda (que da el Do grave) y sin la 2ª (el otro Do): falta Do
  const s = rasgueo(porId.C, { quitar: [5, 2] });
  const croma = cromaDesdeEspectro(espectro(s, 16384), SR, 16384);
  const ev = evaluarAcorde(croma, porId.C);
  assert.equal(ev.coincide, false);
  assert.ok(ev.faltan.some((f) => LETRAS[f.pc] === 'C'), 'debería faltar C');
  const texto = consejoAcorde(ev, porId.C);
  assert.match(texto, /Do/);
});

test('avisa si suena una cuerda que debía ir apagada', () => {
  // D tocando también la 6ª al aire (Mi)
  const s = rasgueo(porId.D, { extra: [40] });
  const croma = cromaDesdeEspectro(espectro(s, 16384), SR, 16384);
  const ev = evaluarAcorde(croma, porId.D);
  const texto = consejoAcorde(ev, porId.D);
  assert.equal(ev.coincide, false, `aceptó D con la 6ª sonando (${ev.puntaje.toFixed(3)})`);
  assert.ok(ev.apagar.includes(6), `debería pedir apagar la 6ª: ${texto}`);
});
