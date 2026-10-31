// Reconocimiento de acordes por cromagrama y dibujo de diagramas.
import { CUERDAS, LETRAS, SOLFEO, parsearTrastes } from './musica.js';

const ARMONICOS = [1, 2, 3, 4, 5, 6];
const PESO_ARMONICO = ARMONICOS.map((h) => 1 / Math.pow(h, 0.9));

/**
 * Cromagrama (energía por cada una de las 12 notas) a partir del espectro.
 * magnitudes: Float32Array lineal de tamaño fftSize/2.
 */
export function cromaDesdeEspectro(magnitudes, sampleRate, fftSize, opciones = {}) {
  const fMin = opciones.fMin ?? 75;
  const fMax = opciones.fMax ?? 1500;
  const binHz = sampleRate / fftSize;
  const kMin = Math.max(2, Math.floor(fMin / binHz));
  const kMax = Math.min(magnitudes.length - 2, Math.ceil(fMax / binHz));
  const croma = new Float32Array(12);
  if (kMax <= kMin) return croma;

  const rango = Array.from(magnitudes.subarray(kMin, kMax + 1)).sort((a, b) => a - b);
  const piso = rango[Math.floor(rango.length * 0.5)] || 0;
  const pico = rango[rango.length - 1] || 0;
  const minimo = Math.max(piso * (opciones.factorPiso ?? 4), pico * 0.02);

  for (let k = kMin; k <= kMax; k++) {
    const b = magnitudes[k];
    if (b < minimo || b <= magnitudes[k - 1] || b < magnitudes[k + 1]) continue;
    const a = magnitudes[k - 1];
    const c = magnitudes[k + 1];
    const den = a - 2 * b + c;
    const off = den !== 0 ? (0.5 * (a - c)) / den : 0;
    const f = (k + Math.max(-0.5, Math.min(0.5, off))) * binHz;
    const midi = 69 + 12 * Math.log2(f / 440);
    const r = Math.round(midi);
    const desv = Math.abs(midi - r);
    if (desv > 0.42) continue;
    const pc = ((r % 12) + 12) % 12;
    croma[pc] += Math.sqrt(b) * (1 - desv);
  }
  let max = 0;
  for (let i = 0; i < 12; i++) if (croma[i] > max) max = croma[i];
  if (max > 0) for (let i = 0; i < 12; i++) croma[i] /= max;
  return croma;
}

// Plantilla esperada para un conjunto de notas MIDI (incluye armónicos).
export function plantillaDeNotas(notasMidi) {
  const t = new Float32Array(12);
  for (const n of notasMidi) {
    ARMONICOS.forEach((h, i) => {
      const m = n + 12 * Math.log2(h);
      const pc = ((Math.round(m) % 12) + 12) % 12;
      t[pc] += PESO_ARMONICO[i];
    });
  }
  let max = 0;
  for (let i = 0; i < 12; i++) max = Math.max(max, t[i]);
  for (let i = 0; i < 12; i++) t[i] /= max || 1;
  return t;
}

export function similitud(a, b) {
  let p = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    p += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? p / Math.sqrt(na * nb) : 0;
}

// Notas que suenan en una posición de acorde.
export function notasDeAcorde(acorde) {
  const trastes = parsearTrastes(acorde.trastes);
  const notas = [];
  trastes.forEach((t, i) => {
    if (t !== null && CUERDAS[i]) notas.push({ cuerda: CUERDAS[i].num, traste: t, midi: CUERDAS[i].midi + t });
  });
  return notas;
}

export function clasesDeAcorde(acorde) {
  return [...new Set(notasDeAcorde(acorde).map((n) => n.midi % 12))];
}

// Tríadas mayores y menores genéricas para comparar contra lo que suena.
const ALTERNATIVAS = (() => {
  const lista = [];
  for (let pc = 0; pc < 12; pc++) {
    const raiz = 48 + pc;
    lista.push({ nombre: LETRAS[pc], clases: [pc, (pc + 4) % 12, (pc + 7) % 12], plantilla: plantillaDeNotas([raiz - 12, raiz, raiz + 4, raiz + 7]) });
    lista.push({ nombre: LETRAS[pc] + 'm', clases: [pc, (pc + 3) % 12, (pc + 7) % 12], plantilla: plantillaDeNotas([raiz - 12, raiz, raiz + 3, raiz + 7]) });
  }
  return lista;
})();

const mismoConjunto = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Compara el cromagrama contra el acorde objetivo.
 * Devuelve { coincide, puntaje, parecido, faltan: [{pc, cuerdas}], sobran: [pc], apagar: [cuerdas] }
 */
export function evaluarAcorde(croma, acorde, opciones = {}) {
  const notas = notasDeAcorde(acorde);
  const clases = [...new Set(notas.map((n) => n.midi % 12))];
  const plantilla = plantillaDeNotas(notas.map((n) => n.midi));
  const puntaje = similitud(croma, plantilla);

  let mejorAlt = null;
  let mejorAltPuntaje = 0;
  for (const alt of ALTERNATIVAS) {
    if (mismoConjunto(alt.clases, clases) || alt.clases.every((c) => clases.includes(c))) continue;
    const p = similitud(croma, alt.plantilla);
    if (p > mejorAltPuntaje) {
      mejorAltPuntaje = p;
      mejorAlt = alt;
    }
  }

  const minimo = opciones.minimo ?? 0.8;
  const margen = opciones.margen ?? 0.02;

  // Una nota "falta" si suena muy poco, o mucho menos de lo esperado para esta posición
  const faltan = clases
    .filter((pc) => croma[pc] < Math.max(opciones.umbralFalta ?? 0.22, plantilla[pc] * (opciones.proporcionFalta ?? 0.4)))
    .map((pc) => ({ pc, cuerdas: notas.filter((n) => n.midi % 12 === pc) }));
  // Una nota "sobra" si suena bastante más de lo que explicarían los armónicos del acorde
  const sobran = [];
  for (let pc = 0; pc < 12; pc++) {
    if (!clases.includes(pc) && croma[pc] - plantilla[pc] > (opciones.umbralSobra ?? 0.35)) sobran.push(pc);
  }
  sobran.sort((a, b) => croma[b] - plantilla[b] - (croma[a] - plantilla[a]));
  const coincide =
    puntaje >= minimo && puntaje >= mejorAltPuntaje - margen && faltan.length === 0 && sobran.length === 0;

  // Cuerdas que deberían ir apagadas y cuya nota al aire está sonando
  const trastes = parsearTrastes(acorde.trastes);
  const apagar = [];
  trastes.forEach((t, i) => {
    if (t === null && sobran.includes(CUERDAS[i].midi % 12)) apagar.push(CUERDAS[i].num);
  });

  return {
    coincide,
    puntaje,
    parecido: !coincide && mejorAlt && mejorAltPuntaje > puntaje + margen ? mejorAlt.nombre : null,
    faltan,
    sobran,
    apagar,
  };
}

export function nombreClase(pc) {
  return `${LETRAS[pc]} (${SOLFEO[pc]})`;
}

// Mensaje de corrección en español a partir de la evaluación.
export function consejoAcorde(ev, acorde) {
  if (ev.coincide) return `¡Suena a ${acorde.nombre}!`;
  const partes = [];
  if (ev.apagar.length) {
    const lista = ev.apagar.map((c) => `${c}ª`).join(' y ');
    partes.push(`No toques la ${lista} cuerda${ev.apagar.length > 1 ? 's' : ''}: está sonando y no va.`);
  }
  if (ev.faltan.length) {
    const f = ev.faltan[0];
    const donde = f.cuerdas
      .map((n) => (n.traste === 0 ? `${n.cuerda}ª al aire` : `${n.cuerda}ª, traste ${n.traste}`))
      .join(' o ');
    partes.push(`No se escucha ${nombreClase(f.pc)}: revisa la ${donde}. Presiona justo detrás del traste.`);
  }
  if (!ev.apagar.length && ev.sobran.length) {
    partes.push(`Suena ${nombreClase(ev.sobran[0])}, que no va en el acorde. Puede ser un dedo mal puesto o una cuerda rozada.`);
  }
  if (ev.parecido && !partes.length) partes.push(`Ahorita suena más a ${ev.parecido}. Revisa la posición del diagrama.`);
  if (!partes.length) partes.push('Casi. Rasguea parejo todas las cuerdas que van y deja que suenen.');
  return partes.join(' ');
}

// ---------- Diagrama SVG ----------

export function diagramaAcorde(acorde) {
  const trastes = parsearTrastes(acorde.trastes);
  const dedos = String(acorde.dedos || '')
    .split(',')
    .map((d) => d.trim());
  const pisados = trastes.filter((t) => t !== null && t > 0);
  const maxT = pisados.length ? Math.max(...pisados) : 0;
  const minT = pisados.length ? Math.min(...pisados) : 0;
  const inicio = maxT <= 4 ? 1 : minT;
  const filas = Math.max(4, maxT - inicio + 1);

  const ancho = 200;
  const izq = 34;
  const der = 18;
  const arriba = 38;
  const sep = (ancho - izq - der) / 5;
  const alto = arriba + filas * 34 + 16;
  const altoTraste = 34;
  const x = (i) => izq + i * sep;
  const y = (f) => arriba + f * altoTraste;

  let s = `<svg class="diagrama" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Diagrama del acorde ${acorde.nombre}">`;
  // trastes
  for (let f = 0; f <= filas; f++) {
    const grueso = f === 0 && inicio === 1;
    s += `<line x1="${x(0)}" y1="${y(f)}" x2="${x(5)}" y2="${y(f)}" class="${grueso ? 'cejuela' : 'traste'}"/>`;
  }
  // cuerdas (más gruesas las graves)
  for (let i = 0; i < 6; i++) {
    s += `<line x1="${x(i)}" y1="${y(0)}" x2="${x(i)}" y2="${y(filas)}" class="cuerda" style="stroke-width:${2.6 - i * 0.3}"/>`;
  }
  if (inicio > 1) {
    s += `<text x="${izq - 12}" y="${y(0) + altoTraste / 2 + 5}" class="num-traste" text-anchor="end">${inicio}</text>`;
  }
  // cejilla
  if (Number(acorde.cejilla) > 0) {
    const fc = Number(acorde.cejilla) - inicio;
    const cuerdasCej = trastes.map((t, i) => (t === Number(acorde.cejilla) ? i : -1)).filter((i) => i >= 0);
    if (cuerdasCej.length > 1) {
      const a = Math.min(...cuerdasCej);
      const b = Math.max(...cuerdasCej);
      s += `<rect x="${x(a) - 9}" y="${y(fc) + altoTraste / 2 - 9}" width="${x(b) - x(a) + 18}" height="18" rx="9" class="punto"/>`;
    }
  }
  trastes.forEach((t, i) => {
    if (t === null) {
      s += `<text x="${x(i)}" y="${arriba - 12}" class="marca" text-anchor="middle">×</text>`;
    } else if (t === 0) {
      s += `<circle cx="${x(i)}" cy="${arriba - 17}" r="6" class="aire"/>`;
    } else {
      const f = t - inicio;
      const cy = y(f) + altoTraste / 2;
      const enCejilla = Number(acorde.cejilla) > 0 && t === Number(acorde.cejilla);
      if (!enCejilla) s += `<circle cx="${x(i)}" cy="${cy}" r="11" class="punto"/>`;
      const d = dedos[i];
      if (d && d !== '0' && d !== 'x' && !enCejilla) {
        s += `<text x="${x(i)}" y="${cy + 4.5}" class="dedo" text-anchor="middle">${d}</text>`;
      }
    }
  });
  s += '</svg>';
  return s;
}
