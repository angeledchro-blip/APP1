// Detección de tono (una sola nota) con el algoritmo YIN.

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/**
 * Devuelve { frecuencia, claridad } o null si no hay una nota clara.
 * buf: Float32Array con la señal (−1..1). sampleRate: Hz.
 */
export function detectarTono(buf, sampleRate, opciones = {}) {
  const fMin = opciones.fMin ?? 60;
  const fMax = opciones.fMax ?? 1400;
  const umbral = opciones.umbral ?? 0.12;
  const tauMin = Math.max(2, Math.floor(sampleRate / fMax));
  const tauMax = Math.min(Math.floor(sampleRate / fMin), Math.floor(buf.length / 2));
  const W = Math.min(opciones.ventana ?? 2048, buf.length - tauMax - 1);
  if (W < 256 || tauMax <= tauMin) return null;

  // 1) Función de diferencia
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }

  // 2) Diferencia normalizada acumulada
  const dp = new Float32Array(tauMax + 2);
  dp[0] = 1;
  let acum = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    acum += d[tau];
    dp[tau] = acum > 0 ? (d[tau] * tau) / acum : 1;
  }

  // 3) Primer valle por debajo del umbral
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (dp[t] < umbral) {
      while (t + 1 <= tauMax && dp[t + 1] < dp[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) {
    let mejor = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (dp[t] < dp[mejor]) mejor = t;
    if (dp[mejor] > (opciones.umbralMax ?? 0.35)) return null;
    tau = mejor;
  }

  // 4) Evitar errores de octava hacia arriba (fundamental débil, 2º armónico fuerte)
  const doble = tau * 2;
  if (doble <= tauMax) {
    let t2 = doble;
    // busca el mínimo local cerca del doble
    for (let t = Math.max(tauMin, doble - 3); t <= Math.min(tauMax, doble + 3); t++) if (dp[t] < dp[t2]) t2 = t;
    if (dp[tau] > 0.05 && dp[t2] < dp[tau] * 0.5) tau = t2;
  }

  // 5) Interpolación parabólica
  let tauFino = tau;
  if (tau > 1 && tau <= tauMax) {
    const a = dp[tau - 1];
    const b = dp[tau];
    const c = dp[tau + 1];
    const den = a + c - 2 * b;
    if (den !== 0) {
      const off = (a - c) / (2 * den);
      if (Math.abs(off) < 1) tauFino = tau + off;
    }
  }
  return { frecuencia: sampleRate / tauFino, claridad: 1 - dp[tau] };
}

// Mediana de los últimos valores para que el número no brinque.
export class Estabilizador {
  constructor(n = 5) {
    this.n = n;
    this.valores = [];
  }
  agregar(v) {
    this.valores.push(v);
    if (this.valores.length > this.n) this.valores.shift();
    return this.mediana();
  }
  limpiar() {
    this.valores = [];
  }
  mediana() {
    if (!this.valores.length) return null;
    const s = [...this.valores].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
}
