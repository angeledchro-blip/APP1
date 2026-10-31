// Micrófono: lee la señal ~30 veces por segundo y reparte nivel, tono y cromagrama.
import { rms, detectarTono } from './tono.js';
import { cromaDesdeEspectro } from './acordes.js';

export const UMBRAL_NIVEL = 0.006;
const F_MAX_CROMA = 1600;

export class MotorAudio {
  constructor() {
    this.activo = false;
    this.oyentes = new Set();
    this.quiereCroma = false;
    this.cuadro = 0;
    this.nivelSuave = 0;
  }

  async iniciar() {
    if (this.activo) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este dispositivo no deja usar el micrófono desde aquí.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const Contexto = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Contexto();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const fuente = this.ctx.createMediaStreamSource(this.stream);
    this.anTiempo = this.ctx.createAnalyser();
    this.anTiempo.fftSize = 4096;
    this.anTiempo.smoothingTimeConstant = 0;
    this.anFrec = this.ctx.createAnalyser();
    this.anFrec.fftSize = 16384;
    this.anFrec.smoothingTimeConstant = 0.5;
    fuente.connect(this.anTiempo);
    fuente.connect(this.anFrec);
    this.bufT = new Float32Array(this.anTiempo.fftSize);
    this.bufF = new Float32Array(this.anFrec.frequencyBinCount);
    this.mag = new Float32Array(this.anFrec.frequencyBinCount);
    this.binesCroma = Math.min(this.bufF.length, Math.ceil(F_MAX_CROMA / (this.ctx.sampleRate / this.anFrec.fftSize)) + 4);
    this.activo = true;
    this.nivelSuave = 0;
    this.bucle();
  }

  detener() {
    this.activo = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
  }

  escuchar(fn) {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  }

  bucle = () => {
    if (!this.activo) return;
    this.raf = requestAnimationFrame(this.bucle);
    this.cuadro++;
    if (this.cuadro % 2) return;

    this.anTiempo.getFloatTimeDomainData(this.bufT);
    const nivel = rms(this.bufT);
    const ataque = nivel > UMBRAL_NIVEL * 2 && nivel > this.nivelSuave * 1.6;
    this.nivelSuave = this.nivelSuave * 0.7 + nivel * 0.3;

    let tono = null;
    let croma = null;
    if (nivel > UMBRAL_NIVEL) {
      tono = detectarTono(this.bufT, this.ctx.sampleRate);
      if (this.quiereCroma) {
        this.anFrec.getFloatFrequencyData(this.bufF);
        for (let i = 0; i < this.binesCroma; i++) this.mag[i] = Math.pow(10, this.bufF[i] / 20);
        croma = cromaDesdeEspectro(this.mag, this.ctx.sampleRate, this.anFrec.fftSize);
      }
    }
    const datos = { nivel, ataque, tono, croma, t: performance.now() };
    for (const fn of this.oyentes) fn(datos);
  };
}
