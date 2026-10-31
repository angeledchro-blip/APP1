// Vista de dibujo: ruta de ejercicios, sesión guiada con cámara en vivo y revisión que aprueba el ejercicio.
import { progreso } from './progreso.js';
import { voz } from './voz.js';

const $ = (sel) => document.querySelector(sel);
const LADO_MAX = 1600; // revisión completa
const LADO_VIVO = 768; // vistazos en vivo (ligeros para que respondan rápido)
const UMBRAL_CAMBIO = 2.5; // diferencia mínima (0-255) para mandar un vistazo nuevo

let ejercicios = [];
let actual = null;
let elegidoAMano = false;
let aprobar = 3;
let stream = null;
let foto = null;
let revisando = false;

const vivo = {
  activo: false,
  intervalo: 10,
  enviando: false,
  timer: null,
  firma: null,
  ultimoEnvio: 0,
  consejos: [],
};

const sesion = {
  activa: false,
  fin: 0,
  inicio: 0,
};

export const dibujo = {
  iniciar,
  actualizar,
  pausar,
  ocupado: () => Boolean(stream) || revisando || vivo.enviando,
  configurar: (c) => {
    vivo.intervalo = Number(c?.intervaloVivo) || 10;
    aprobar = Number(c?.aprobarDibujo) || 3;
  },
};

function pausar() {
  if (stream) {
    cerrarCamara();
    estado('inicial');
  }
}

function iniciar() {
  $('#di-ejercicio').addEventListener('change', (e) => {
    elegidoAMano = true;
    elegir(e.target.value);
  });
  $('#di-abrir').addEventListener('click', empezarSesion);
  $('#di-tomar').addEventListener('click', () => tomarFoto(true));
  $('#di-otra').addEventListener('click', empezarSesion);
  $('#di-pausar').addEventListener('click', alternarVivo);
  $('#di-voz').addEventListener('click', () => {
    voz.alternar();
    pintarVoz();
  });
  $('#di-cerrar').addEventListener('click', () => {
    cerrarCamara();
    $('#di-resultado').hidden = true;
    estado('inicial');
  });
  $('#di-revisar').addEventListener('click', revisar);
  $('#di-siguiente').addEventListener('click', () => {
    const sig = ejercicioActual();
    if (sig) {
      elegidoAMano = false;
      elegir(sig.id);
      $('#di-resultado').hidden = true;
      estado('inicial');
      $('#vista-dibujo').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });
  progreso.alCambiar(() => pintarRuta());
  pintarVoz();
  estado('inicial');
}

function actualizar(lista) {
  ejercicios = lista;
  const previo = actual?.id;
  pintarRuta();
  const destino = elegidoAMano && lista.some((e) => e.id === previo) ? previo : ejercicioActual()?.id ?? lista[0]?.id;
  elegir(destino);
}

// ---------------------------------------------------------------- ruta de ejercicios

function calificacion(id) {
  return progreso.numero(`dibujo:${id}`, 0);
}

function aprobado(id) {
  return calificacion(id) >= aprobar;
}

// El ejercicio que toca: el primero que aún no apruebas
function ejercicioActual() {
  return ejercicios.find((e) => !aprobado(e.id)) || null;
}

function estadoDe(e) {
  if (aprobado(e.id)) return 'aprobado';
  return e === ejercicioActual() ? 'actual' : 'bloqueado';
}

function pintarRuta() {
  const sel = $('#di-ejercicio');
  if (!ejercicios.length) return;
  const valor = sel.value;
  sel.innerHTML = ejercicios
    .map((e, i) => {
      const est = estadoDe(e);
      const marca = est === 'aprobado' ? `✓ ` : est === 'actual' ? '▶ ' : '🔒 ';
      return `<option value="${esc(e.id)}">${marca}${i + 1}. ${esc(e.titulo)}</option>`;
    })
    .join('');
  if (valor) sel.value = valor;
  const hechos = ejercicios.filter((e) => aprobado(e.id)).length;
  $('#di-avance').textContent = `Llevas ${hechos} de ${ejercicios.length} ejercicios aprobados.`;
  if (actual) pintarEstado();
}

function pintarEstado() {
  const est = estadoDe(actual);
  const el = $('#di-estado-ej');
  el.dataset.estado = est;
  if (est === 'aprobado') el.textContent = `✓ Aprobado con ${calificacion(actual.id)}/5. Puedes repetirlo cuando quieras.`;
  else if (est === 'actual') el.textContent = `▶ Este es tu ejercicio de ahora. Se aprueba con ${aprobar}/5 o más en la revisión.`;
  else {
    const toca = ejercicioActual();
    el.textContent = `🔒 Te recomiendo primero aprobar "${toca ? toca.titulo : ''}". Puedes intentarlo, pero cuesta más.`;
  }
}

function elegir(id) {
  const cambio = actual && actual.id !== id;
  actual = ejercicios.find((e) => e.id === id) || null;
  if (!actual) return;
  $('#di-ejercicio').value = actual.id;
  $('#di-titulo').textContent = actual.titulo;
  $('#di-objetivo').textContent = actual.objetivo;
  $('#di-instrucciones').textContent = actual.instrucciones;
  $('#di-criterios').textContent = actual.criterios;
  $('#di-minutos').textContent = `Sesión: ${actual.minutos} min`;
  pintarEstado();
  if (cambio) {
    vivo.consejos = [];
    pintarHistorial();
  }
}

// ---------------------------------------------------------------- sesión con cámara

async function empezarSesion() {
  foto = null;
  $('#di-resultado').hidden = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este dispositivo no deja usar la cámara desde aquí.');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    const v = $('#di-video');
    v.srcObject = stream;
    await v.play().catch(() => {});
    estado('camara');
    $('.camara').scrollIntoView({ block: 'start', behavior: 'smooth' });
    sesion.activa = true;
    sesion.inicio = Date.now();
    sesion.fin = sesion.inicio + (Number(actual?.minutos) || 10) * 60000;
    iniciarVivo();
    voz.hablar(`Empezamos: ${actual?.titulo || 'dibujo libre'}. Tienes ${actual?.minutos || 10} minutos. Te voy diciendo cómo vas.`);
  } catch (err) {
    stream = null;
    const msg =
      err?.name === 'NotAllowedError'
        ? 'La app no tiene permiso de usar la cámara. Dale permiso en Ajustes del teléfono > Apps > Práctica > Permisos.'
        : 'No se pudo abrir la cámara: ' + (err?.message || err);
    mostrarError(msg);
    estado('inicial');
  }
}

function cerrarCamara() {
  detenerVivo();
  sesion.activa = false;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  const v = $('#di-video');
  if (v) v.srcObject = null;
}

function capturar(ladoMax, calidad) {
  const v = $('#di-video');
  const w = v.videoWidth;
  const h = v.videoHeight;
  if (!w || !h) return null;
  const escala = Math.min(1, ladoMax / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
  return { canvas, url: canvas.toDataURL('image/jpeg', calidad) };
}

// ---------------------------------------------------------------- consejos en vivo

function iniciarVivo() {
  vivo.activo = true;
  vivo.firma = null;
  vivo.ultimoEnvio = Date.now() - (vivo.intervalo - 5) * 1000; // primer vistazo a los ~5 s
  $('#di-vivo').hidden = false;
  if (!vivo.consejos.length) $('#di-vivo-texto').textContent = 'Empieza a dibujar; en unos segundos te digo cómo vas.';
  clearInterval(vivo.timer);
  vivo.timer = setInterval(tic, 1000);
  pintarVivo();
}

function detenerVivo() {
  vivo.activo = false;
  clearInterval(vivo.timer);
  vivo.timer = null;
  voz.callar();
}

function alternarVivo() {
  if (vivo.activo) {
    vivo.activo = false;
    pintarVivo();
  } else if (stream) {
    vivo.activo = true;
    vivo.ultimoEnvio = 0;
    pintarVivo();
  }
}

function reloj(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function pintarVivo() {
  $('#di-pausar').textContent = vivo.activo ? 'Pausar consejos' : 'Reanudar consejos';
  const e = $('#di-vivo-estado');
  const resta = sesion.activa ? ` · quedan ${reloj(sesion.fin - Date.now())}` : '';
  if (!vivo.activo) e.textContent = `Consejos en pausa${resta}`;
  else if (vivo.enviando) e.textContent = `Viendo tu hoja…${resta}`;
  else e.textContent = `En vivo${resta}`;
  e.dataset.activo = String(vivo.activo);
}

async function tic() {
  if (!stream) return;
  // Se acabó el tiempo de la sesión: revisión completa automática
  if (sesion.activa && Date.now() >= sesion.fin && !vivo.enviando) {
    sesion.activa = false;
    voz.hablar('Se acabó el tiempo. Vamos a revisar tu dibujo.');
    tomarFoto(true);
    return;
  }
  pintarVivo();
  if (!vivo.activo || vivo.enviando) return;
  if (Date.now() - vivo.ultimoEnvio < vivo.intervalo * 1000) return;

  const cap = capturar(LADO_VIVO, 0.7);
  if (!cap) return;
  const firma = firmaImagen(cap.canvas);
  if (vivo.firma && diferencia(firma, vivo.firma) < UMBRAL_CAMBIO) return; // nada nuevo en la hoja: espera
  vivo.enviando = true;
  vivo.ultimoEnvio = Date.now();
  pintarVivo();
  try {
    const r = await fetch('/api/dibujo/vivo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        imagen: cap.url,
        ejercicio: actual?.id ?? null,
        previos: vivo.consejos.slice(-4),
        minuto: (Date.now() - sesion.inicio) / 60000,
      }),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) {
      $('#di-vivo-texto').textContent = datos.error || `El servidor respondió ${r.status}.`;
      if (r.status === 429) vivo.activo = false;
    } else if (stream) {
      vivo.firma = firma;
      vivo.consejos.push(datos.consejo);
      $('#di-vivo-texto').textContent = datos.consejo;
      voz.hablar(datos.consejo);
      pintarHistorial();
    }
  } catch {
    $('#di-vivo-texto').textContent = 'Sin conexión: reintento en el siguiente vistazo.';
  } finally {
    vivo.enviando = false;
    pintarVivo();
  }
}

// Huella de 32x24 en gris para saber si la hoja cambió desde el último vistazo
function firmaImagen(origen) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 24;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(origen, 0, 0, 32, 24);
  const d = g.getImageData(0, 0, 32, 24).data;
  const f = new Uint8Array(32 * 24);
  for (let i = 0; i < f.length; i++) f[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) | 0;
  return f;
}

function diferencia(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

function pintarHistorial() {
  const ol = $('#di-historial');
  const lista = vivo.consejos.slice(-6).reverse();
  ol.innerHTML = lista.map((c) => `<li>${esc(c)}</li>`).join('');
  ol.hidden = lista.length < 2;
}

function pintarVoz() {
  const b = $('#di-voz');
  b.textContent = voz.activa() ? '🔊 Voz: sí' : '🔇 Voz: no';
  b.setAttribute('aria-pressed', String(voz.activa()));
  b.hidden = !voz.disponible();
}

// ---------------------------------------------------------------- revisión completa

function tomarFoto(revisarYa) {
  const cap = capturar(LADO_MAX, 0.85);
  if (!cap) return;
  foto = cap.url;
  cerrarCamara();
  $('#di-foto').src = foto;
  estado('foto');
  if (revisarYa) revisar();
}

async function revisar() {
  if (!foto || revisando) return;
  revisando = true;
  estado('revisando');
  try {
    const r = await fetch('/api/dibujo/revisar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imagen: foto, ejercicio: actual?.id ?? null, nota: $('#di-nota').value }),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || `El servidor respondió ${r.status}.`);
    let encabezado = '';
    if (datos.nivel !== null && datos.nivel !== undefined) {
      if (datos.aprobado) {
        progreso.cargar({ [`dibujo:${actual.id}`]: String(Math.max(datos.nivel, calificacion(actual.id))) });
        const sig = ejercicioActual();
        encabezado = `<p class="calificacion aprobado">✓ ¡Aprobado con ${datos.nivel}/5!${sig ? ` Ya puedes pasar a "${esc(sig.titulo)}".` : ' Terminaste toda la ruta.'}</p>`;
        voz.hablar(`¡Aprobado con ${datos.nivel} de 5!`);
        $('#di-siguiente').hidden = !sig || sig.id === actual.id;
      } else {
        encabezado = `<p class="calificacion">Sacaste ${datos.nivel}/5. Para aprobar necesitas ${aprobar}. Practica lo que te marco y vuelve a intentarlo.</p>`;
        voz.hablar(`Sacaste ${datos.nivel} de 5. Vamos otra vez.`);
        $('#di-siguiente').hidden = true;
      }
    } else {
      $('#di-siguiente').hidden = true;
    }
    $('#di-resultado').innerHTML = encabezado + formatear(datos.comentario);
    $('#di-resultado').hidden = false;
    $('#di-nota').value = '';
    estado('resultado');
  } catch (err) {
    mostrarError(err.message || String(err));
    estado('foto');
  } finally {
    revisando = false;
  }
}

function mostrarError(msg) {
  const el = $('#di-resultado');
  el.innerHTML = `<p class="error">${esc(msg)}</p>`;
  el.hidden = false;
}

// Estados de la pantalla
function estado(e) {
  const ver = (id, si) => ($(id).hidden = !si);
  ver('#di-video', e === 'camara');
  ver('#di-vivo', e === 'camara');
  ver('#di-foto', e === 'foto' || e === 'revisando' || e === 'resultado');
  ver('#di-vacio', e === 'inicial');
  ver('#di-abrir', e === 'inicial');
  ver('#di-tomar', e === 'camara');
  ver('#di-pausar', e === 'camara');
  ver('#di-cerrar', e === 'camara');
  ver('#di-revisar', e === 'foto');
  ver('#di-otra', e === 'foto' || e === 'resultado');
  ver('#di-nota-campo', e === 'foto');
  ver('#di-cargando', e === 'revisando');
  if (e !== 'resultado') $('#di-siguiente').hidden = true;
  if (e === 'camara' || e === 'revisando') $('#di-resultado').hidden = true;
  if (voz.disponible()) $('#di-voz').hidden = !(e === 'camara' || e === 'inicial');
}

// Texto de la IA → HTML seguro (negritas, listas y párrafos)
function formatear(texto) {
  const lineas = esc(texto || '').split(/\r?\n/);
  let html = '';
  let enLista = false;
  for (const l of lineas) {
    const t = l.trim();
    const item = /^[-*•]\s+(.*)$/.exec(t);
    if (item) {
      if (!enLista) {
        html += '<ul>';
        enLista = true;
      }
      html += `<li>${negritas(item[1])}</li>`;
      continue;
    }
    if (enLista) {
      html += '</ul>';
      enLista = false;
    }
    if (!t) continue;
    const titulo = /^\*\*(.+?)\*\*:?$/.exec(t);
    html += titulo ? `<h3>${titulo[1]}</h3>` : `<p>${negritas(t)}</p>`;
  }
  if (enLista) html += '</ul>';
  return html;
}

function negritas(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
