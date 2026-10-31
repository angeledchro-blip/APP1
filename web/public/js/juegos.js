// Mini juegos de guitarra: cambios de acordes, acorde sorpresa, al ritmo y encontrar notas.
import { evaluarAcorde, diagramaAcorde } from './acordes.js';
import { midiDeFrecuencia, nota, LETRAS, SOLFEO } from './musica.js';
import { Estabilizador } from './tono.js';
import { UMBRAL_NIVEL } from './audio.js';
import { mastil } from './mastil.js';
import { camino } from './camino.js';
import { progreso } from './progreso.js';

const $ = (s) => document.querySelector(s);

const INFO = {
  repite: {
    titulo: 'Repite el acorde',
    ayuda: 'Pon el acorde, rasguea y deja que suene. Luego suelta los dedos y vuelve a ponerlo. Cada vez que suene limpio cuenta.',
  },
  cambios: {
    titulo: 'Cambios de 1 minuto',
    ayuda: 'Cambia entre los dos acordes lo más rápido que puedas, pero que suenen limpios. Cuento cada cambio que reconozco.',
  },
  sorpresa: {
    titulo: 'Acorde sorpresa',
    ayuda: 'Sale un acorde al azar y tienes que tocarlo rápido. Si te tardas, te enseño el diagrama. Son 10 rondas.',
  },
  ritmo: {
    titulo: 'Al ritmo',
    ayuda: 'Sigue el metrónomo: cada compás son 4 tiempos y el acorde cambia en el tiempo 1. Tienes hasta el tiempo 3 para que suene.',
  },
  nota: {
    titulo: 'Encuentra la nota',
    ayuda: 'Sale una nota: tócala en la cuerda que quieras. Si te tardas, te doy una pista. Son 10 rondas.',
  },
};

const NATURALES = [0, 2, 4, 5, 7, 9, 11];

let base = null; // { motor, asegurarMic }
let acordes = [];
let rutinas = [];
let actual = null;
let p = null; // partida en curso
let reloj = null;
let metro = null;
let reto = null; // { nivel, num, alTerminar } cuando el juego es el reto de un nivel del Camino
const croma = new Float32Array(12);

export const juegos = { iniciar, actualizar, cuadro, detener, lanzarReto };

function iniciar(dependencias) {
  base = dependencias;
  document.querySelectorAll('[data-juego]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.juego)));
  $('#ju-volver').addEventListener('click', () => {
    detener();
    $('#ju-juego').hidden = true;
    $('#ju-menu').hidden = false;
    actual = null;
    if (reto) {
      reto = null;
      base.irA('camino');
    }
  });
  progreso.alCambiar(() => {
    pintarMenu();
    if (actual && !p) {
      pintarOpciones();
      $('#ju-record').textContent = textoRecord();
    }
  });
  $('#ju-empezar').addEventListener('click', () => {
    if (reto?.listo) return $('#ju-volver').click();
    return p ? terminar(true) : empezar();
  });
  $('#ju-opciones').addEventListener('change', () => pantallaInicial());
}

function actualizar(a, r) {
  acordes = a;
  rutinas = r;
  pintarMenu();
  if (actual && !p) {
    pintarOpciones();
    pantallaInicial();
  }
}

function abrir(id) {
  if (!reto && document.querySelector(`[data-juego="${id}"]`)?.disabled) return;
  actual = id;
  $('#ju-menu').hidden = true;
  $('#ju-juego').hidden = false;
  $('#ju-titulo').textContent = reto ? `Reto del nivel ${reto.num}` : INFO[id].titulo;
  $('#ju-ayuda').textContent = reto ? camino.textoReto(reto.nivel) : INFO[id].ayuda;
  $('#ju-volver').textContent = reto ? '‹ Camino' : '‹ Juegos';
  pintarOpciones();
  pantallaInicial();
}

// Abre el juego que corresponde al reto de un nivel, con sus opciones fijas
function lanzarReto(nivel, num, alTerminar) {
  detener();
  reto = { nivel, num, alTerminar };
  abrir(nivel.reto_tipo);
}

// Los juegos de acordes se abren cuando ya hay al menos 2 acordes desbloqueados
function pintarMenu() {
  const n = camino.desbloqueados().size;
  document.querySelectorAll('[data-juego]').forEach((b) => {
    const necesita = b.dataset.juego === 'nota' ? 0 : 2;
    const cerrado = n < necesita;
    b.disabled = cerrado;
    let aviso = b.querySelector('.candado');
    if (cerrado && !aviso) {
      aviso = document.createElement('em');
      aviso.className = 'candado';
      aviso.textContent = '🔒 Se abre al llegar al nivel 2 del Camino';
      b.appendChild(aviso);
    } else if (!cerrado && aviso) {
      aviso.remove();
    }
  });
}

// ---------------------------------------------------------------- opciones y récords

function opcion(valor, texto, elegido) {
  return `<option value="${esc(valor)}"${String(valor) === String(elegido) ? ' selected' : ''}>${esc(texto)}</option>`;
}

function campo(etiqueta, id, opciones) {
  return `<label class="campo"><span>${etiqueta}</span><select id="${id}">${opciones}</select></label>`;
}

function valor(id, def) {
  return $('#' + id)?.value ?? def;
}

// Opción de acorde: los que aún no desbloqueas se ven pero no se pueden escoger
function opcionAcorde(x, elegido, libres) {
  if (libres.has(x.id)) return opcion(x.id, x.nombre, elegido);
  return `<option value="${esc(x.id)}" disabled>🔒 ${esc(x.nombre)} (nivel ${camino.nivelDeAcorde(x.id)})</option>`;
}

function opcionRutina(x, elegido) {
  const n = camino.nivelDeRutina(x);
  if (n <= camino.nivelActual()) return opcion(x.id, x.titulo, elegido);
  return `<option value="${esc(x.id)}" disabled>🔒 ${esc(x.titulo)} (nivel ${n})</option>`;
}

function pintarOpciones() {
  const cont = $('#ju-opciones');
  const libres = camino.desbloqueados();
  const primeros = acordes.filter((x) => libres.has(x.id));
  if (actual === 'repite') {
    const a = reto ? reto.nivel.reto_param : valor('ju-acorde', primeros[0]?.id);
    cont.innerHTML = campo('Acorde', 'ju-acorde', acordes.map((x) => opcionAcorde(x, a, libres)).join(''));
  } else if (actual === 'cambios') {
    const [ra, rb] = reto ? String(reto.nivel.reto_param).split(',') : [];
    const a = ra || valor('ju-a', primeros[0]?.id);
    const b = rb || valor('ju-b', primeros.find((x) => x.id !== a)?.id);
    const lista = (sel) => acordes.map((x) => opcionAcorde(x, sel, libres)).join('');
    cont.innerHTML = campo('Acorde 1', 'ju-a', lista(a)) + campo('Acorde 2', 'ju-b', lista(b));
  } else if (actual === 'sorpresa') {
    const n = valor('ju-pool', 'mios');
    cont.innerHTML = campo(
      'Acordes',
      'ju-pool',
      opcion('mios', `Los que llevas (${primeros.length})`, n) + opcion('todos', 'Todos (incluye los difíciles)', n)
    );
  } else if (actual === 'ritmo') {
    const libresR = rutinas.filter((x) => camino.nivelDeRutina(x) <= camino.nivelActual());
    const r = reto ? reto.nivel.reto_param : valor('ju-rutina', libresR[0]?.id);
    const bpm = reto ? String(reto.nivel.reto_meta) : valor('ju-bpm', '60');
    let bpms = '';
    for (let v = 40; v <= 140; v += 10) bpms += opcion(v, `${v} BPM`, bpm);
    cont.innerHTML =
      campo('Rutina', 'ju-rutina', rutinas.map((x) => opcionRutina(x, r)).join('')) + campo('Velocidad', 'ju-bpm', bpms);
  } else if (actual === 'nota') {
    const m = valor('ju-modo', 'naturales');
    cont.innerHTML = campo(
      'Notas',
      'ju-modo',
      opcion('naturales', 'Solo naturales (Do, Re, Mi…)', m) + opcion('todas', 'Con sostenidos', m)
    );
  }
}

function bloquearOpciones(si) {
  document.querySelectorAll('#ju-opciones select').forEach((s) => (s.disabled = si || Boolean(reto)));
}

// Récords guardados en la base de datos (progreso) con claves record:<juego>:<opciones>
function leerRecord(clave) {
  const v = progreso.leer('record:' + clave);
  return v === null ? undefined : Number(v);
}

function guardarRecord(clave, v, mayorEsMejor) {
  const previo = leerRecord(clave);
  const nuevo = previo === undefined || (mayorEsMejor ? v > previo : v < previo);
  if (nuevo) progreso.guardar('record:' + clave, v);
  return { nuevo, previo };
}

function claveRecord() {
  if (actual === 'cambios') return `cambios:${valor('ju-a')}-${valor('ju-b')}`;
  if (actual === 'sorpresa') return `sorpresa:${valor('ju-pool')}`;
  if (actual === 'ritmo') return `ritmo:${valor('ju-rutina')}`;
  if (actual === 'repite') return null;
  return `nota:${valor('ju-modo')}`;
}

function textoRecord() {
  const clave = claveRecord();
  if (!clave) return '';
  const v = leerRecord(clave);
  if (v === undefined) return 'Todavía no tienes récord aquí.';
  if (actual === 'cambios') return `Tu récord: ${v} cambios`;
  if (actual === 'ritmo') return `Tu récord: ${v} BPM`;
  return `Tu récord: ${v.toFixed(1)} s en promedio`;
}

// ---------------------------------------------------------------- pantalla

function pantallaInicial() {
  $('#ju-record').textContent = textoRecord();
  $('#ju-pulso').hidden = true;
  $('#ju-empezar').textContent = 'Empezar';
  const et = {
    repite: ['seg', 'limpios'],
    cambios: ['seg', 'cambios'],
    sorpresa: ['seg', 'ronda'],
    ritmo: ['BPM', 'a tiempo'],
    nota: ['seg', 'ronda'],
  }[actual];
  $('#ju-tiempo-et').textContent = et[0];
  $('#ju-puntos-et').textContent = et[1];
  $('#ju-sigue').textContent = '';
  $('#ju-diagrama').innerHTML = '';
  if (actual === 'repite') {
    const a = buscar(valor('ju-acorde'));
    $('#ju-tiempo').textContent = '0';
    $('#ju-puntos').textContent = `0/${metaRepite()}`;
    if (a) mostrarAcorde(a, null);
  } else if (actual === 'cambios') {
    const a = buscar(valor('ju-a'));
    $('#ju-tiempo').textContent = '60';
    $('#ju-puntos').textContent = reto ? `0/${reto.nivel.reto_meta}` : '0';
    if (a) mostrarAcorde(a, buscar(valor('ju-b')));
  } else if (actual === 'ritmo') {
    $('#ju-tiempo').textContent = valor('ju-bpm');
    $('#ju-puntos').textContent = '0';
    const r = rutinas.find((x) => x.id === valor('ju-rutina'));
    const sec = r ? secuencia(r) : [];
    if (sec[0]) mostrarAcorde(sec[0], sec[1]);
  } else {
    $('#ju-tiempo').textContent = '0.0';
    $('#ju-puntos').textContent = '0/10';
    $('#ju-nombre').textContent = '?';
  }
  retro(reto ? 'Cuando estés listo, dale Empezar. Si no sale, practica y vuelve a intentarlo.' : 'Dale Empezar cuando estés listo.', '');
}

function metaRepite() {
  return reto ? Number(reto.nivel.reto_meta) || 5 : 5;
}

function mostrarAcorde(a, siguiente, conDiagrama = true) {
  $('#ju-nombre').textContent = a.nombre;
  $('#ju-sigue').textContent = siguiente ? `Sigue: ${siguiente.nombre}` : '';
  $('#ju-diagrama').innerHTML = conDiagrama ? diagramaAcorde(a) : '';
}

function retro(texto, tipo) {
  const el = $('#ju-retro');
  el.textContent = texto;
  el.dataset.tipo = tipo || '';
}

function festejar() {
  const el = $('#ju-tablero');
  el.classList.remove('acierto');
  void el.offsetWidth;
  el.classList.add('acierto');
}

function buscar(id) {
  return acordes.find((a) => a.id === id);
}

function secuencia(r) {
  return r.secuencia
    .split(',')
    .map((id) => buscar(id.trim()))
    .filter(Boolean);
}

function azar(lista, evitar) {
  const opciones = lista.length > 1 ? lista.filter((x) => x !== evitar) : lista;
  return opciones[Math.floor(Math.random() * opciones.length)];
}

// ---------------------------------------------------------------- partida

async function empezar() {
  if (!actual) return;
  if (!(await base.asegurarMic())) {
    retro('Necesito el micrófono para jugar.', 'corregir');
    return;
  }
  const ahora = performance.now();
  p = { id: actual, fase: 'cuenta', bueno: 0, cuentaFin: ahora + 3000, estab: new Estabilizador(5), estables: 0 };
  croma.fill(0);

  if (actual === 'repite') {
    p.objetivo = buscar(valor('ju-acorde'));
    if (!p.objetivo) {
      p = null;
      retro('Escoge un acorde.', 'corregir');
      return;
    }
    p.puntos = 0;
    p.meta = metaRepite();
    p.libre = true;
    p.sinAcorde = 0;
  } else if (actual === 'cambios') {
    p.a = buscar(valor('ju-a'));
    p.b = buscar(valor('ju-b'));
    if (!p.a || !p.b || p.a === p.b) {
      p = null;
      retro('Escoge dos acordes distintos.', 'corregir');
      return;
    }
    p.objetivo = p.a;
    p.puntos = 0;
    p.primero = true;
  } else if (actual === 'sorpresa') {
    const libres = camino.desbloqueados();
    p.pool = valor('ju-pool', 'mios') === 'todos' ? acordes.slice() : acordes.filter((a) => libres.has(a.id));
    if (p.pool.length < 2) p.pool = acordes.filter((a) => Number(a.nivel) <= 1);
    p.ronda = 0;
    p.tiempos = [];
  } else if (actual === 'nota') {
    p.pool = valor('ju-modo') === 'todas' ? [...Array(12).keys()] : NATURALES;
    p.ronda = 0;
    p.tiempos = [];
    p.errores = 0;
  } else if (actual === 'ritmo') {
    iniciarRitmo();
  }

  $('#ju-empezar').textContent = 'Terminar';
  bloquearOpciones(true);
  if (actual !== 'ritmo') retro('Prepárate…', '');
  clearInterval(reloj);
  reloj = setInterval(tic, 100);
}

function arrancar() {
  p.fase = 'jugando';
  const ahora = performance.now();
  if (p.id === 'repite') {
    p.t0 = ahora;
    mostrarAcorde(p.objetivo, null);
    retro(`Pon ${p.objetivo.nombre} y rasguea.`, '');
  } else if (p.id === 'cambios') {
    p.fin = ahora + 60000;
    mostrarAcorde(p.objetivo, p.objetivo === p.a ? p.b : p.a);
    retro(`¡Ya! Toca ${p.objetivo.nombre}.`, '');
  } else if (p.id === 'sorpresa' || p.id === 'nota') {
    siguienteRonda();
  }
}

function siguienteRonda() {
  p.ronda++;
  p.fase = 'jugando';
  p.t0 = performance.now();
  p.pista = false;
  p.bueno = 0;
  p.estables = 0;
  p.esperar = false;
  p.estab.limpiar();
  $('#ju-puntos').textContent = `${p.ronda}/10`;
  if (p.id === 'sorpresa') {
    p.objetivo = azar(p.pool, p.objetivo);
    mostrarAcorde(p.objetivo, null, false);
    retro('¡Tócalo!', '');
  } else {
    p.objetivo = azar(p.pool, p.objetivo);
    $('#ju-nombre').textContent = LETRAS[p.objetivo];
    $('#ju-sigue').textContent = SOLFEO[p.objetivo];
    $('#ju-diagrama').innerHTML = '';
    retro('Búscala en cualquier cuerda.', '');
  }
}

function tic() {
  if (!p) return;
  const ahora = performance.now();
  if (p.id === 'ritmo') return pasoRitmo(ahora);
  if (p.fase === 'cuenta') {
    const s = Math.ceil((p.cuentaFin - ahora) / 1000);
    if (s <= 0) return arrancar();
    $('#ju-nombre').textContent = String(s);
    $('#ju-sigue').textContent = '';
    $('#ju-diagrama').innerHTML = '';
    return;
  }
  if (p.id === 'repite') {
    $('#ju-tiempo').textContent = String(Math.floor((ahora - p.t0) / 1000));
    return;
  }
  if (p.id === 'cambios') {
    const resta = Math.max(0, Math.ceil((p.fin - ahora) / 1000));
    $('#ju-tiempo').textContent = String(resta);
    if (resta <= 0) terminar(false);
    return;
  }
  if (p.fase !== 'jugando') return;
  const seg = (ahora - p.t0) / 1000;
  $('#ju-tiempo').textContent = seg.toFixed(1);
  if (p.id === 'sorpresa' && seg > 4 && !p.pista) {
    p.pista = true;
    $('#ju-diagrama').innerHTML = diagramaAcorde(p.objetivo);
    retro('Pista: aquí está el diagrama.', 'corregir');
  }
  if (p.id === 'nota' && seg > 5 && !p.pista) {
    p.pista = true;
    let cuerda = 6;
    let traste = (p.objetivo - 4 + 12) % 12;
    if (traste > 7) {
      cuerda = 5;
      traste = (p.objetivo - 9 + 12) % 12;
    }
    $('#ju-diagrama').innerHTML = mastil(cuerda, traste);
    retro(traste === 0 ? `Pista: ${cuerda}ª cuerda al aire.` : `Pista: ${cuerda}ª cuerda, traste ${traste}.`, 'corregir');
  }
}

function cuadro(d) {
  if (!p) return;
  if (d.croma) {
    for (let i = 0; i < 12; i++) croma[i] = croma[i] * 0.5 + d.croma[i] * 0.5;
  } else {
    for (let i = 0; i < 12; i++) croma[i] *= 0.85;
  }
  if (p.id === 'ritmo') return cuadroRitmo(d);
  if (p.fase !== 'jugando') return;

  if (p.id === 'repite') {
    if (!p.libre) {
      // Para contar otra vez, el acorde tiene que dejar de sonar (soltar los dedos o apagar las cuerdas)
      const suena = d.nivel >= UMBRAL_NIVEL * 1.5 && d.croma && evaluarAcorde(croma, p.objetivo).coincide;
      p.sinAcorde = suena ? 0 : p.sinAcorde + 1;
      if (p.sinAcorde >= 12) {
        p.libre = true;
        retro(`Ahora vuelve a poner ${p.objetivo.nombre}.`, '');
      }
      return;
    }
    if (!oye(d, p.objetivo, 8)) return;
    p.puntos++;
    p.libre = false;
    p.sinAcorde = 0;
    $('#ju-puntos').textContent = `${p.puntos}/${p.meta}`;
    festejar();
    if (p.puntos >= p.meta) return terminar(false);
    retro(`¡Limpio! (${p.puntos}/${p.meta}) Suelta los dedos…`, 'bien');
    return;
  }
  if (p.id === 'cambios') {
    if (!oye(d, p.objetivo, 7)) return;
    if (p.primero) {
      p.primero = false;
      retro(`¡Eso! Ahora cambia a ${p.objetivo === p.a ? p.b.nombre : p.a.nombre}.`, 'bien');
    } else {
      p.puntos++;
      $('#ju-puntos').textContent = reto ? `${p.puntos}/${reto.nivel.reto_meta}` : String(p.puntos);
      retro('¡Cambio!', 'bien');
    }
    festejar();
    p.objetivo = p.objetivo === p.a ? p.b : p.a;
    mostrarAcorde(p.objetivo, p.objetivo === p.a ? p.b : p.a);
  } else if (p.id === 'sorpresa') {
    if (!oye(d, p.objetivo, 7)) return;
    const t = (d.t - p.t0) / 1000;
    p.tiempos.push({ acorde: p.objetivo.nombre, t });
    retro(`¡${p.objetivo.nombre} en ${t.toFixed(1)} s!`, 'bien');
    festejar();
    pausaYSigue();
  } else if (p.id === 'nota') {
    cuadroNota(d);
  }
}

function oye(d, acorde, cuadros) {
  if (d.nivel < UMBRAL_NIVEL * 1.5 || !d.croma) {
    p.bueno = 0;
    return false;
  }
  p.bueno = evaluarAcorde(croma, acorde).coincide ? p.bueno + 1 : 0;
  if (p.bueno >= cuadros) {
    p.bueno = 0;
    return true;
  }
  return false;
}

function pausaYSigue() {
  p.fase = 'pausa';
  const partida = p;
  setTimeout(() => {
    if (p !== partida) return;
    if (p.ronda >= 10) terminar(false);
    else siguienteRonda();
  }, 700);
}

function cuadroNota(d) {
  if (d.nivel < UMBRAL_NIVEL) {
    p.esperar = false;
    p.estables = 0;
    p.estab.limpiar();
    return;
  }
  if (d.ataque) {
    p.esperar = false;
    p.estables = 0;
    p.estab.limpiar();
  }
  if (p.esperar || !d.tono || d.tono.claridad < 0.85) return;
  const m = midiDeFrecuencia(d.tono.frecuencia);
  const med = p.estab.agregar(m);
  p.estables = Math.abs(m - med) < 0.5 ? p.estables + 1 : 0;
  if (p.estables < 6) return;
  p.estables = 0;
  p.esperar = true;
  const n = nota(med);
  if (n.pc === p.objetivo) {
    const t = (d.t - p.t0) / 1000;
    p.tiempos.push({ nota: n.letra, t });
    retro(`¡${n.letra} (${n.solfeo}) en ${t.toFixed(1)} s!`, 'bien');
    festejar();
    pausaYSigue();
  } else {
    p.errores++;
    retro(`Esa es ${n.letra} (${n.solfeo}). Sigue buscando.`, 'corregir');
  }
}

// ---------------------------------------------------------------- al ritmo

function iniciarRitmo() {
  const r = rutinas.find((x) => x.id === valor('ju-rutina')) || rutinas[0];
  const sec = r ? secuencia(r) : [];
  if (!sec.length) {
    p = null;
    retro('Esa rutina no tiene acordes.', 'corregir');
    return;
  }
  const ctx = base.motor.ctx;
  p.rutina = r;
  p.sec = sec;
  p.bpm = Number(valor('ju-bpm', '60'));
  p.compases = sec.length <= 8 ? sec.length * 2 : sec.length;
  p.aciertos = new Array(p.compases).fill(false);
  p.compas = -2;
  p.beatMs = 60000 / p.bpm;
  const inicio = ctx.currentTime + 0.4;
  p.t0 = performance.now() + 400;
  p.fase = 'jugando';
  metro = programarMetronomo(ctx, inicio, p.beatMs / 1000, (p.compases + 1) * 4);
  $('#ju-tiempo').textContent = String(p.bpm);
  $('#ju-puntos').textContent = `0/${p.compases}`;
  $('#ju-pulso').hidden = false;
}

function programarMetronomo(ctx, t0, beat, total) {
  const salida = ctx.createGain();
  salida.gain.value = 0.35;
  salida.connect(ctx.destination);
  for (let i = 0; i < total; i++) {
    const t = t0 + i * beat;
    const o = ctx.createOscillator();
    const env = ctx.createGain();
    o.frequency.value = i % 4 === 0 ? 3000 : 2200;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(env);
    env.connect(salida);
    o.start(t);
    o.stop(t + 0.06);
  }
  return salida;
}

function posicionRitmo(ahora) {
  const pulso = Math.floor((ahora - p.t0) / p.beatMs);
  return { pulso, compas: Math.floor(pulso / 4) - 1, tiempo: ((pulso % 4) + 4) % 4 };
}

function pasoRitmo(ahora) {
  if (!p || p.id !== 'ritmo') return;
  const { pulso, compas, tiempo } = posicionRitmo(ahora);
  document.querySelectorAll('#ju-pulso span').forEach((s, i) => s.classList.toggle('activo', pulso >= 0 && i === tiempo));
  if (compas === p.compas) return;

  // Terminó un compás
  if (p.compas >= 0 && !p.aciertos[p.compas]) {
    retro(`No alcancé a oír ${p.sec[p.compas % p.sec.length].nombre} a tiempo.`, 'corregir');
  }
  p.compas = compas;
  p.bueno = 0;
  if (compas >= p.compases) return terminar(false);
  if (compas < 0) {
    $('#ju-nombre').textContent = pulso < 0 ? '…' : String(tiempo + 1);
    $('#ju-sigue').textContent = `Prepárate: ${p.sec[0].nombre}`;
    $('#ju-diagrama').innerHTML = diagramaAcorde(p.sec[0]);
    if (pulso >= 0) retro('Cuenta de entrada…', '');
    p.compas = pulso < 0 ? -2 : -1;
    return;
  }
  mostrarAcorde(p.sec[compas % p.sec.length], compas + 1 < p.compases ? p.sec[(compas + 1) % p.sec.length] : null);
}

function cuadroRitmo(d) {
  pasoRitmo(d.t);
  if (!p || p.id !== 'ritmo') return;
  const { compas, tiempo } = posicionRitmo(d.t);
  if (compas < 0 && p.compas === -1) {
    $('#ju-nombre').textContent = String(tiempo + 1);
  }
  if (compas < 0 || compas >= p.compases || p.aciertos[compas] || tiempo > 2) return;
  if (oye(d, p.sec[compas % p.sec.length], 5)) {
    p.aciertos[compas] = true;
    const n = p.aciertos.filter(Boolean).length;
    $('#ju-puntos').textContent = `${n}/${p.compases}`;
    retro('¡A tiempo!', 'bien');
    festejar();
  }
}

// ---------------------------------------------------------------- fin

function terminar(cancelado) {
  if (!p) return;
  const partida = p;
  p = null;
  clearInterval(reloj);
  reloj = null;
  if (metro) {
    try {
      metro.disconnect();
    } catch {
      /* ya estaba desconectado */
    }
    metro = null;
  }
  bloquearOpciones(false);
  $('#ju-pulso').hidden = true;
  $('#ju-empezar').textContent = 'Jugar otra vez';
  if (cancelado) {
    retro('Juego terminado.', '');
    return;
  }
  const exito = resultado(partida);
  $('#ju-record').textContent = textoRecord();
  if (reto && exito) {
    const r = reto;
    reto.alTerminar(true).then((texto) => {
      retro(texto, 'bien');
      $('#ju-empezar').textContent = 'Volver al camino';
      r.listo = true;
    });
  }
}

function detener() {
  if (p) terminar(true);
  if (actual) $('#ju-empezar').textContent = 'Empezar';
}

function resultado(r) {
  let texto = '';
  let exito = false;
  if (r.id === 'repite') {
    exito = r.puntos >= r.meta;
    texto = exito ? `¡Lo hiciste ${r.puntos} veces limpio!` : `Llevabas ${r.puntos} de ${r.meta}.`;
  } else if (r.id === 'cambios') {
    const { nuevo } = guardarRecord(`cambios:${r.a.id}-${r.b.id}`, r.puntos, true);
    texto = `Hiciste ${r.puntos} cambios en un minuto.`;
    if (reto) exito = r.puntos >= Number(reto.nivel.reto_meta);
    if (reto && !exito) texto += ` Para pasar el nivel necesitas ${reto.nivel.reto_meta}.`;
    if (r.puntos < 15) texto += ' Antes de mover la mano, piensa la forma del siguiente acorde.';
    else if (r.puntos < 30) texto += ' Bien. Intenta mover todos los dedos juntos, como una sola pieza.';
    else texto += ' ¡Muy bien! Prueba con otro par de acordes.';
    if (nuevo) texto += ' ¡Nuevo récord!';
  } else if (r.id === 'sorpresa' || r.id === 'nota') {
    if (!r.tiempos.length) {
      texto = 'No alcanzaste a completar ninguna ronda.';
    } else {
      const prom = r.tiempos.reduce((s, x) => s + x.t, 0) / r.tiempos.length;
      const lento = r.tiempos.reduce((a, b) => (b.t > a.t ? b : a));
      const clave = r.id === 'sorpresa' ? `sorpresa:${valor('ju-pool')}` : `nota:${valor('ju-modo')}`;
      const { nuevo } = r.tiempos.length === 10 ? guardarRecord(clave, Math.round(prom * 10) / 10, false) : { nuevo: false };
      texto = `Promedio: ${prom.toFixed(1)} s. El que más te costó: ${lento.acorde || lento.nota} (${lento.t.toFixed(1)} s).`;
      if (r.id === 'nota' && r.errores) texto += ` Fallaste ${r.errores} vez${r.errores === 1 ? '' : 'es'}.`;
      if (nuevo) texto += ' ¡Nuevo récord!';
    }
  } else if (r.id === 'ritmo') {
    const n = r.aciertos.filter(Boolean).length;
    const pct = Math.round((n / r.compases) * 100);
    texto = `${n} de ${r.compases} compases a tiempo (${pct}%).`;
    if (reto) {
      exito = pct >= 80;
      if (!exito) texto += ' Para pasar el nivel necesitas 80%.';
    }
    if (pct >= 80) {
      const { nuevo } = guardarRecord(`ritmo:${r.rutina.id}`, r.bpm, true);
      if (nuevo) texto += ' ¡Nuevo récord!';
    }
    if (reto) {
      /* en el reto la velocidad es fija */
    } else if (pct >= 90 && r.bpm < 140) {
      texto += ` ¡Súbele a ${r.bpm + 10} BPM!`;
      const sel = $('#ju-bpm');
      if (sel) sel.value = String(r.bpm + 10);
    } else if (pct < 60 && r.bpm > 40) {
      texto += ` Bájale a ${r.bpm - 10} BPM y vuelve a intentar.`;
      const sel = $('#ju-bpm');
      if (sel) sel.value = String(r.bpm - 10);
    }
  }
  retro(texto, exito || !reto ? 'bien' : 'corregir');
  return exito;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
