// Vista de guitarra: afinador, práctica de notas, práctica de acordes y juegos.
import { MotorAudio, UMBRAL_NIVEL } from './audio.js';
import { Estabilizador } from './tono.js';
import { CUERDAS, LETRAS, midiDeFrecuencia, nota, cuerda as datosCuerda, parsearNotas } from './musica.js';
import { evaluarAcorde, consejoAcorde, diagramaAcorde, clasesDeAcorde } from './acordes.js';
import { mastil } from './mastil.js';
import { juegos } from './juegos.js';
import { camino } from './camino.js';
import { progreso } from './progreso.js';

const $ = (sel) => document.querySelector(sel);
const motor = new MotorAudio();
let sub = 'camino';

export const guitarra = {
  iniciar,
  actualizar,
  pausar,
  ocupado: () => motor.activo,
};

function iniciar() {
  document.querySelectorAll('[data-sub]').forEach((b) =>
    b.addEventListener('click', () => cambiarSub(b.dataset.sub))
  );
  $('#mic').addEventListener('click', alternarMic);
  afinador.iniciar();
  notas.iniciar();
  acordes.iniciar();
  juegos.iniciar({ motor, asegurarMic, irA: cambiarSub });
  camino.iniciar({
    practicar: (practica) => {
      const [tipo, id] = String(practica).split(':');
      cambiarSub('acordes');
      if (tipo === 'rutina') acordes.elegir(id);
      else acordes.practicarUno(id);
    },
    reto: (nivel, num) => {
      cambiarSub('juegos');
      juegos.lanzarReto(nivel, num, async () => {
        await camino.subirNivel(num);
        acordes.pintarCandados();
        const siguiente = c.niveles[num];
        if (!siguiente) return `¡Pasaste el nivel ${num} y terminaste el Camino!`;
        const desbloquea = siguiente.acordes ? ` Desbloqueaste: ${siguiente.acordes.split(',').join(', ')}.` : '';
        return `¡Pasaste el nivel ${num}!${desbloquea} Sigue en el Camino.`;
      });
    },
  });
  progreso.alCambiar(() => acordes.pintarCandados());
  motor.escuchar((d) => {
    medidor(d.nivel);
    if (sub === 'camino') return;
    if (sub === 'afinador') afinador.cuadro(d);
    else if (sub === 'notas') notas.cuadro(d);
    else if (sub === 'acordes') acordes.cuadro(d);
    else juegos.cuadro(d);
  });
  cambiarSub(sub);
}

let c = { niveles: [] };

function actualizar(contenido) {
  c = contenido;
  camino.actualizar(c.niveles || [], c.acordes || [], c.rutinas || []);
  notas.actualizar(c.lecciones || []);
  acordes.actualizar(c.acordes || [], c.rutinas || []);
  juegos.actualizar(c.acordes || [], c.rutinas || []);
}

function pausar() {
  if (motor.activo) {
    motor.detener();
    pintarMic();
  }
}

async function alternarMic() {
  if (motor.activo) {
    motor.detener();
    pintarMic();
  } else {
    await asegurarMic();
  }
}

// Prende el micrófono si está apagado. Devuelve true si quedó escuchando.
async function asegurarMic() {
  if (motor.activo) return true;
  let error = '';
  try {
    await motor.iniciar();
  } catch (err) {
    error =
      err?.name === 'NotAllowedError'
        ? 'La app no tiene permiso de usar el micrófono. Dale permiso en Ajustes del teléfono > Apps > Práctica > Permisos.'
        : 'No se pudo abrir el micrófono: ' + (err?.message || err);
  }
  pintarMic(error);
  return motor.activo;
}

function pintarMic(error = '') {
  $('#mic').setAttribute('aria-pressed', String(motor.activo));
  $('#mic-texto').textContent = motor.activo ? 'Escuchando… (toca para apagar)' : 'Activar micrófono';
  $('#mic-estado').textContent = error;
  $('#mic-estado').hidden = !error;
  document.body.classList.toggle('escuchando', motor.activo);
  if (!motor.activo) {
    // Limpia lo que se quedó en pantalla de la última escucha
    medidor(0);
    juegos.detener();
    afinador.apagar();
    acordes.limpiar();
    if (notas.lista.length && !notas.bloqueado) retro('#no-retro', 'Activa el micrófono y toca la nota.', '');
  }
}

function medidor(nivel) {
  const v = Math.min(1, Math.sqrt(nivel / 0.15));
  $('#medidor').style.setProperty('--nivel', v.toFixed(3));
}

function cambiarSub(nombre) {
  if (sub === 'juegos' && nombre !== 'juegos') juegos.detener();
  sub = nombre;
  document.querySelectorAll('[data-sub]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.sub === nombre)));
  ['camino', 'afinador', 'notas', 'acordes', 'juegos'].forEach((n) => ($('#sub-' + n).hidden = n !== nombre));
  motor.quiereCroma = nombre === 'acordes' || nombre === 'juegos';
  if (nombre === 'afinador') afinador.redimensionar();
}

// ------------------------------------------------------------------ Afinador

const afinador = {
  estab: new Estabilizador(5),
  modo: 'auto',
  color: 'apagado',
  ultimoTono: 0,

  iniciar() {
    this.canvas = $('#af-cuerda');
    this.ctx2d = this.canvas.getContext('2d');
    const estilo = getComputedStyle(document.documentElement);
    const v = (n, def) => estilo.getPropertyValue(n).trim() || def;
    this.colores = {
      afinada: v('--menta', '#95e0b0'),
      desafinada: v('--ambar', '#f1c56d'),
      apagado: v('--grafito-3', '#3a3e49'),
      puntas: v('--papel-2', '#a9a9b0'),
    };
    document.querySelectorAll('[data-cuerda]').forEach((b) =>
      b.addEventListener('click', () => {
        this.modo = b.dataset.cuerda;
        document.querySelectorAll('[data-cuerda]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.estab.limpiar();
      })
    );
    window.addEventListener('resize', () => this.redimensionar());
    this.redimensionar();
    const animar = (t) => {
      this.dibujar(t);
      requestAnimationFrame(animar);
    };
    requestAnimationFrame(animar);
  },

  apagar() {
    this.color = 'apagado';
    this.afinadaCuadros = 0;
    this.estab.limpiar();
    $('#af-flecha').dataset.dir = '';
    $('#af-indicacion').textContent = '';
    $('#af-cents').textContent = '';
  },

  redimensionar() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
  },

  cuadro(d) {
    const ahora = d.t;
    if (!d.tono || d.tono.claridad < 0.85) {
      if (ahora - this.ultimoTono > 600 && this.color !== 'apagado') {
        this.color = 'apagado';
        this.afinadaCuadros = 0;
        this.estab.limpiar();
        $('#af-flecha').dataset.dir = '';
        $('#af-indicacion').textContent = 'Toca una cuerda y déjala sonar.';
      }
      return;
    }
    this.ultimoTono = ahora;
    const midi = this.estab.agregar(midiDeFrecuencia(d.tono.frecuencia));
    const n = nota(midi);
    $('#af-nota').textContent = n.letra;
    $('#af-solfeo').textContent = `${n.solfeo} ${n.octava}`;

    let objetivo = null;
    if (this.modo === 'auto') {
      let mejor = null;
      for (const c of CUERDAS) if (!mejor || Math.abs(midi - c.midi) < Math.abs(midi - mejor.midi)) mejor = c;
      if (Math.abs(midi - mejor.midi) <= 4.5) objetivo = mejor;
    } else {
      objetivo = datosCuerda(Number(this.modo));
    }

    let cents;
    const flecha = $('#af-flecha');
    if (objetivo) {
      cents = (midi - objetivo.midi) * 100;
      const n2 = nota(objetivo.midi);
      $('#af-objetivo').textContent = `Afinando la ${objetivo.num}ª cuerda: ${n2.letra} (${objetivo.nombre})`;
      const abs = Math.abs(cents);
      let txt;
      if (abs <= 5) {
        txt = '¡Afinada! Pasa a la siguiente cuerda.';
        flecha.dataset.dir = 'ok';
      } else if (cents < 0) {
        txt = abs > 50 ? 'Muy baja: aprieta la clavija.' : 'Un poco baja: aprieta tantito la clavija.';
        flecha.dataset.dir = 'subir';
      } else {
        txt = abs > 50 ? 'Muy alta: afloja la clavija.' : 'Un poco alta: afloja tantito la clavija.';
        flecha.dataset.dir = 'bajar';
      }
      $('#af-indicacion').textContent = txt;
      // Marca la cuerda como afinada si se sostiene afinada ~1 segundo
      this.afinadaCuadros = abs <= 5 && this.cuerdaActual === objetivo.num ? this.afinadaCuadros + 1 : 0;
      this.cuerdaActual = objetivo.num;
      if (this.afinadaCuadros === 28) {
        document.querySelector(`[data-cuerda="${objetivo.num}"]`)?.classList.add('lista');
      }
    } else {
      cents = (midi - Math.round(midi)) * 100;
      $('#af-objetivo').textContent = 'Nota que suena';
      $('#af-indicacion').textContent = Math.abs(cents) <= 5 ? 'Nota afinada.' : 'Está entre dos notas.';
      flecha.dataset.dir = Math.abs(cents) <= 5 ? 'ok' : cents < 0 ? 'subir' : 'bajar';
    }
    const signo = cents > 0 ? '+' : cents < 0 ? '−' : '';
    $('#af-cents').textContent = Math.abs(cents) > 99 ? `${signo}${(Math.abs(cents) / 100).toFixed(1)} semitonos` : `${signo}${Math.abs(Math.round(cents))} cents`;
    this.objetivoCents = Math.max(-50, Math.min(50, cents));
    this.color = Math.abs(cents) <= 5 ? 'afinada' : 'desafinada';
  },

  // Medidor de aguja: la zona verde del centro es "afinada".
  aguja: 0,
  objetivoCents: 0,
  afinadaCuadros: 0,
  cuerdaActual: null,

  dibujar() {
    const c = this.ctx2d;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    const meta = this.color === 'apagado' ? 0 : this.objetivoCents;
    this.aguja = reducirMovimiento() ? meta : this.aguja + (meta - this.aguja) * 0.22;

    c.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H - 14 * dpr;
    const R = Math.min(W / 2 - 24 * dpr, H - 34 * dpr);
    const ang = (ct) => ((-90 + ct * 1.2) * Math.PI) / 180; // ±50 cents = ±60°

    // arco base
    c.lineCap = 'butt';
    c.lineWidth = 16 * dpr;
    c.strokeStyle = this.colores.apagado;
    c.beginPath();
    c.arc(cx, cy, R, ang(-50), ang(50));
    c.stroke();
    // zona afinada (±5 cents)
    c.strokeStyle = this.colores.afinada;
    c.beginPath();
    c.arc(cx, cy, R, ang(-5), ang(5));
    c.stroke();

    // marcas cada 10 cents y etiquetas
    c.strokeStyle = this.colores.puntas;
    c.fillStyle = this.colores.puntas;
    c.font = `${12 * dpr}px system-ui, sans-serif`;
    c.textAlign = 'center';
    for (let ct = -50; ct <= 50; ct += 10) {
      const a = ang(ct);
      const largo = ct % 50 === 0 || ct === 0 ? 16 : 9;
      c.lineWidth = (ct === 0 ? 3 : 1.5) * dpr;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R - 12 * dpr), cy + Math.sin(a) * (R - 12 * dpr));
      c.lineTo(cx + Math.cos(a) * (R - (12 + largo) * dpr), cy + Math.sin(a) * (R - (12 + largo) * dpr));
      c.stroke();
    }
    const etiqueta = (txt, ct) => {
      const a = ang(ct);
      c.fillText(txt, cx + Math.cos(a) * (R - 42 * dpr), cy + Math.sin(a) * (R - 42 * dpr) + 4 * dpr);
    };
    etiqueta('baja', -40);
    etiqueta('alta', 40);

    // aguja
    const color = this.colores[this.color];
    const a = ang(this.aguja);
    c.lineCap = 'round';
    c.lineWidth = 4 * dpr;
    c.strokeStyle = color;
    c.shadowColor = this.color === 'afinada' ? color : 'transparent';
    c.shadowBlur = this.color === 'afinada' ? 14 * dpr : 0;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a) * (R + 6 * dpr), cy + Math.sin(a) * (R + 6 * dpr));
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = color;
    c.beginPath();
    c.arc(cx, cy, 8 * dpr, 0, Math.PI * 2);
    c.fill();
  },
};

// ------------------------------------------------------------------ Notas

const notas = {
  lecciones: [],
  leccion: null,
  lista: [],
  idx: 0,
  intentos: 0,
  aciertos: 0,
  esperarAtaque: false,
  estables: 0,
  estab: new Estabilizador(5),
  bloqueado: false,

  iniciar() {
    $('#no-leccion').addEventListener('change', (e) => this.elegir(e.target.value));
    $('#no-saltar').addEventListener('click', () => this.siguiente());
    $('#no-reiniciar').addEventListener('click', () => this.elegir(this.leccion?.id));
  },

  actualizar(lecciones) {
    this.lecciones = lecciones;
    const sel = $('#no-leccion');
    const actual = this.leccion?.id;
    sel.innerHTML = lecciones.map((l) => `<option value="${esc(l.id)}">${esc(l.titulo)}</option>`).join('');
    const sigue = lecciones.find((l) => l.id === actual);
    if (sigue && sigue.notas === this.leccion.notas) {
      sel.value = actual;
      this.leccion = sigue;
      $('#no-desc').textContent = sigue.descripcion;
    } else if (lecciones.length) {
      this.elegir(sigue ? sigue.id : lecciones[0].id);
    }
  },

  elegir(id) {
    this.leccion = this.lecciones.find((l) => l.id === id) || this.lecciones[0];
    if (!this.leccion) return;
    $('#no-leccion').value = this.leccion.id;
    $('#no-desc').textContent = this.leccion.descripcion;
    this.lista = parsearNotas(this.leccion.notas);
    this.idx = 0;
    this.aciertos = 0;
    this.intentos = 0;
    this.bloqueado = false;
    this.mostrar();
    retro('#no-retro', motor.activo ? 'Toca la nota.' : 'Activa el micrófono y toca la nota.', '');
  },

  mostrar() {
    const n = this.lista[this.idx];
    if (!n) return;
    const info = nota(n.midi);
    $('#no-progreso').textContent = `(${this.idx + 1} de ${this.lista.length})`;
    $('#no-letra').textContent = info.letra;
    $('#no-solfeo').textContent = info.solfeo;
    $('#no-donde').textContent = n.traste === 0 ? `${n.cuerda}ª cuerda, al aire` : `${n.cuerda}ª cuerda, traste ${n.traste}`;
    $('#no-mastil').innerHTML = mastil(n.cuerda, n.traste);
  },

  siguiente() {
    this.idx++;
    this.intentos = 0;
    this.bloqueado = false;
    this.estab.limpiar();
    if (this.idx >= this.lista.length) {
      const total = this.lista.length;
      retro('#no-retro', `¡Lección completa! Le atinaste a la primera en ${this.aciertos} de ${total} notas.`, 'bien');
      this.idx = this.lista.length - 1;
      this.bloqueado = true;
      $('#no-progreso').textContent = '(completa)';
      return;
    }
    this.mostrar();
  },

  cuadro(d) {
    if (this.bloqueado || !this.lista.length) return;
    if (d.nivel < UMBRAL_NIVEL) {
      this.esperarAtaque = false;
      this.estables = 0;
      this.estab.limpiar();
      return;
    }
    if (d.ataque) {
      this.esperarAtaque = false;
      this.estables = 0;
      this.estab.limpiar();
    }
    if (this.esperarAtaque || !d.tono || d.tono.claridad < 0.85) return;
    const m = midiDeFrecuencia(d.tono.frecuencia);
    const med = this.estab.agregar(m);
    this.estables = Math.abs(m - med) < 0.5 ? this.estables + 1 : 0;
    if (this.estables >= 6) {
      this.esperarAtaque = true;
      this.estables = 0;
      this.evaluar(med);
    }
  },

  evaluar(med) {
    const objetivo = this.lista[this.idx];
    const r = Math.round(med);
    const diff = r - objetivo.midi;
    const cents = Math.round((med - r) * 100);
    const tocada = nota(r);
    if (diff % 12 === 0) {
      if (this.intentos === 0) this.aciertos++;
      const extra = Math.abs(cents) > 30 ? ' Suena desafinada, revisa el afinador.' : '';
      retro('#no-retro', `¡Eso! ${tocada.letra} (${tocada.solfeo}).${extra}`, 'bien');
      this.bloqueado = true;
      setTimeout(() => this.siguiente(), 700);
      return;
    }
    this.intentos++;
    const s = Math.abs(diff) === 1 ? '' : 's';
    let txt = `Tocaste ${tocada.letra} (${tocada.solfeo}). `;
    if (objetivo.traste === 0) {
      txt += `Esta va al aire: toca la ${objetivo.cuerda}ª cuerda sin pisar ningún traste.`;
    } else if (Math.abs(diff) <= 7) {
      txt +=
        diff < 0
          ? `Te faltó: súbele ${-diff} traste${s}, hacia el cuerpo de la guitarra.`
          : `Te pasaste: bájale ${diff} traste${s}, hacia la cabeza de la guitarra.`;
    } else {
      txt += `Parece que estás en otra cuerda: busca la ${objetivo.cuerda}ª.`;
    }
    retro('#no-retro', txt, 'corregir');
  },
};

// ------------------------------------------------------------------ Acordes

const acordes = {
  todos: [],
  rutinas: [],
  rutina: null,
  secuencia: [],
  idx: 0,
  bueno: 0,
  sonando: 0,
  silencio: 0,
  ultimoConsejo: 0,
  bloqueado: false,
  croma: new Float32Array(12),
  inicio: null,

  iniciar() {
    $('#ac-rutina').addEventListener('change', (e) => this.elegir(e.target.value));
    $('#ac-anterior').addEventListener('click', () => this.mover(-1));
    $('#ac-siguiente').addEventListener('click', () => this.mover(1));
    $('#ac-reiniciar').addEventListener('click', () => this.elegir(this.rutina?.id ?? '__todos'));
    $('#ac-croma').innerHTML = LETRAS.map(
      (l, i) => `<div class="barra-croma" data-pc="${i}"><span class="relleno"></span><span class="etq">${l}</span></div>`
    ).join('');
    $('#ac-biblioteca').addEventListener('click', (e) => {
      const b = e.target.closest('[data-acorde]');
      if (b) this.practicarUno(b.dataset.acorde);
    });
  },

  actualizar(todos, rutinas) {
    this.todos = todos;
    this.rutinas = rutinas;
    const sel = $('#ac-rutina');
    const actual = sel.value;
    this.pintarCandados();
    const sigue = actual && (actual === '__todos' || rutinas.some((r) => r.id === actual)) ? actual : rutinas[0]?.id ?? '__todos';
    if (sigue !== actual || !this.secuencia.length) this.elegir(sigue);
    else {
      sel.value = actual;
      this.refrescarSecuencia();
    }
  },

  // Las rutinas y acordes de niveles que aún no llegas se ven con candado (se pueden ver, no se esconden)
  pintarCandados() {
    const sel = $('#ac-rutina');
    const actual = sel.value;
    const nivel = camino.nivelActual();
    sel.innerHTML =
      this.rutinas
        .map((r) => {
          const n = camino.nivelDeRutina(r);
          return `<option value="${esc(r.id)}">${n > nivel ? `🔒 ${esc(r.titulo)} (nivel ${n})` : esc(r.titulo)}</option>`;
        })
        .join('') + '<option value="__todos">Todos los acordes</option>';
    if (actual) sel.value = actual;
    const libres = camino.desbloqueados();
    $('#ac-biblioteca').innerHTML = this.todos
      .map((a) => {
        const cerrado = !libres.has(a.id);
        const etq = cerrado ? `<small>🔒 nivel ${camino.nivelDeAcorde(a.id)}</small>` : '';
        return `<button class="mini-acorde${cerrado ? ' bloqueado' : ''}" data-acorde="${esc(a.id)}" aria-label="Practicar ${esc(a.nombre)}">${diagramaAcorde(a)}<span>${esc(a.nombre)}</span>${etq}</button>`;
      })
      .join('');
    this.avisoNivel();
  },

  avisoNivel() {
    const aviso = $('#ac-aviso');
    if (!aviso) return;
    let n = 1;
    if (this.rutina) n = camino.nivelDeRutina(this.rutina);
    else if (this.secuencia.length === 1) n = camino.nivelDeAcorde(this.secuencia[0].id);
    const cerrado = n > camino.nivelActual();
    aviso.hidden = !cerrado;
    aviso.textContent = cerrado ? `🔒 Esto es del nivel ${n} del Camino. Puedes practicarlo, pero te va a costar menos si primero pasas los niveles anteriores.` : '';
  },

  // Si cambió el contenido en vivo, vuelve a leer los acordes sin perder el paso.
  refrescarSecuencia() {
    if (!this.rutina) return;
    const r = this.rutinas.find((x) => x.id === this.rutina.id);
    if (!r) return;
    this.rutina = r;
    this.secuencia = r.secuencia.split(',').map((id) => this.buscar(id.trim())).filter(Boolean);
    this.idx = Math.min(this.idx, this.secuencia.length - 1);
    this.mostrar();
  },

  buscar(id) {
    return this.todos.find((a) => a.id === id);
  },

  elegir(id) {
    $('#ac-rutina').value = id;
    const biblio = id === '__todos';
    $('#ac-biblioteca').hidden = !biblio;
    $('#ac-practica').hidden = biblio;
    this.inicio = null;
    if (biblio) {
      this.rutina = null;
      this.secuencia = [];
      $('#ac-aviso').hidden = true;
      $('#ac-desc').textContent = 'Toca un acorde para practicarlo.';
      return;
    }
    this.rutina = this.rutinas.find((r) => r.id === id) || null;
    if (!this.rutina) return;
    $('#ac-desc').textContent = this.rutina.descripcion;
    this.secuencia = this.rutina.secuencia.split(',').map((x) => this.buscar(x.trim())).filter(Boolean);
    this.idx = 0;
    this.reiniciarEscucha();
    this.mostrar();
    this.avisoNivel();
    retro('#ac-retro', motor.activo ? 'Rasguea el acorde.' : 'Activa el micrófono y rasguea el acorde.', '');
  },

  practicarUno(id) {
    const a = this.buscar(id);
    if (!a) return;
    this.rutina = null;
    this.secuencia = [a];
    this.idx = 0;
    $('#ac-biblioteca').hidden = true;
    $('#ac-practica').hidden = false;
    $('#ac-desc').textContent = 'Practicando un solo acorde. Elige "Todos los acordes" para cambiar.';
    this.reiniciarEscucha();
    this.mostrar();
    this.avisoNivel();
    retro('#ac-retro', motor.activo ? 'Rasguea el acorde.' : 'Activa el micrófono y rasguea el acorde.', '');
  },

  mover(paso) {
    if (!this.secuencia.length) return;
    this.idx = (this.idx + paso + this.secuencia.length) % this.secuencia.length;
    this.reiniciarEscucha();
    this.mostrar();
    retro('#ac-retro', 'Rasguea el acorde.', '');
  },

  reiniciarEscucha() {
    this.bueno = 0;
    this.sonando = 0;
    this.bloqueado = false;
  },

  limpiar() {
    this.croma.fill(0);
    document.querySelectorAll('.barra-croma').forEach((b) => b.style.setProperty('--v', '0'));
    this.reiniciarEscucha();
    if (this.secuencia.length) retro('#ac-retro', 'Activa el micrófono y rasguea el acorde.', '');
  },

  mostrar() {
    const a = this.secuencia[this.idx];
    if (!a) return;
    $('#ac-nombre').textContent = a.nombre;
    $('#ac-paso').textContent = this.secuencia.length > 1 ? `${this.idx + 1} de ${this.secuencia.length}` : '';
    $('#ac-diagrama').innerHTML = diagramaAcorde(a);
    const sig = this.secuencia.length > 1 ? this.secuencia[(this.idx + 1) % this.secuencia.length] : null;
    $('#ac-sigue').textContent = sig ? `Sigue: ${sig.nombre}` : '';
    const clases = clasesDeAcorde(a);
    document.querySelectorAll('.barra-croma').forEach((b) => b.classList.toggle('del-acorde', clases.includes(Number(b.dataset.pc))));
  },

  cuadro(d) {
    const a = this.secuencia[this.idx];
    if (d.croma) {
      for (let i = 0; i < 12; i++) this.croma[i] = this.croma[i] * 0.5 + d.croma[i] * 0.5;
    } else {
      for (let i = 0; i < 12; i++) this.croma[i] *= 0.85;
    }
    document.querySelectorAll('.barra-croma').forEach((b, i) => b.style.setProperty('--v', this.croma[i].toFixed(3)));
    if (!a || this.bloqueado) return;

    if (d.nivel < UMBRAL_NIVEL * 1.5 || !d.croma) {
      this.silencio++;
      if (this.silencio > 30) this.sonando = 0;
      this.bueno = 0;
      return;
    }
    this.silencio = 0;
    this.sonando++;
    if (!this.inicio) this.inicio = d.t;
    const ev = evaluarAcorde(this.croma, a);
    this.bueno = ev.coincide ? this.bueno + 1 : 0;
    if (this.bueno >= 10) {
      this.bloqueado = true;
      retro('#ac-retro', `¡Suena a ${a.nombre}!`, 'bien');
      if (this.secuencia.length > 1) {
        setTimeout(() => this.avanzar(), 900);
      } else {
        setTimeout(() => {
          this.reiniciarEscucha();
          retro('#ac-retro', 'Otra vez: suelta y vuelve a hacer el acorde.', '');
        }, 1600);
      }
      return;
    }
    if (!ev.coincide && this.sonando >= 18 && d.t - this.ultimoConsejo > 900) {
      this.ultimoConsejo = d.t;
      retro('#ac-retro', consejoAcorde(ev, a), 'corregir');
    }
  },

  avanzar() {
    this.reiniciarEscucha();
    if (this.idx + 1 >= this.secuencia.length) {
      const seg = this.inicio ? Math.round((performance.now() - this.inicio) / 1000) : 0;
      const tiempo = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
      retro('#ac-retro', `¡Rutina completa en ${tiempo}! Repítela y trata de bajarle al tiempo.`, 'bien');
      this.idx = 0;
      this.inicio = null;
      this.bloqueado = true;
      setTimeout(() => {
        this.bloqueado = false;
        this.mostrar();
      }, 2500);
      return;
    }
    this.idx++;
    this.mostrar();
    retro('#ac-retro', 'Rasguea el acorde.', '');
  },
};

// ------------------------------------------------------------------ utilidades

function retro(sel, texto, tipo) {
  const el = $(sel);
  el.textContent = texto;
  el.dataset.tipo = tipo || '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function reducirMovimiento() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
