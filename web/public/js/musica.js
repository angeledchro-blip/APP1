// Utilidades de música: nombres de notas, cuerdas de la guitarra y conversiones.

export const LETRAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const SOLFEO = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

// Afinación estándar. Índice 0 = 6ª cuerda (la más gruesa).
export const CUERDAS = [
  { num: 6, midi: 40, nombre: 'Mi grave' },
  { num: 5, midi: 45, nombre: 'La' },
  { num: 4, midi: 50, nombre: 'Re' },
  { num: 3, midi: 55, nombre: 'Sol' },
  { num: 2, midi: 59, nombre: 'Si' },
  { num: 1, midi: 64, nombre: 'Mi agudo' },
];

export function midiDeFrecuencia(f) {
  return 69 + 12 * Math.log2(f / 440);
}

export function frecuenciaDeMidi(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function claseDe(midi) {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function nota(midi) {
  const r = Math.round(midi);
  const pc = claseDe(r);
  return { midi: r, pc, letra: LETRAS[pc], solfeo: SOLFEO[pc], octava: Math.floor(r / 12) - 1 };
}

export function cuerda(num) {
  return CUERDAS.find((c) => c.num === num);
}

export function midiDe(cuerdaNum, traste) {
  return cuerda(cuerdaNum).midi + traste;
}

// "6:0,6:1" -> [{cuerda: 6, traste: 0, midi: 40}, ...]
export function parsearNotas(texto) {
  return String(texto)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [c, t] = p.split(':').map(Number);
      return { cuerda: c, traste: t, midi: midiDe(c, t) };
    });
}

// "x,3,2,0,1,0" -> [null, 3, 2, 0, 1, 0]  (6ª → 1ª)
export function parsearTrastes(texto) {
  return String(texto)
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .map((p) => (p === 'x' || p === '' ? null : Number(p)));
}

export function ordinal(n) {
  return `${n}ª`;
}
