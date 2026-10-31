// Vista de dibujo: cámara en vivo con consejos en tiempo real y revisión completa.
const $ = (sel) => document.querySelector(sel);
const LADO_MAX = 1600; // revisión completa
const LADO_VIVO = 960; // vistazos en vivo (más ligeros)
const UMBRAL_CAMBIO = 3; // diferencia mínima (0-255) para mandar un vistazo nuevo

let ejercicios = [];
let actual = null;
let stream = null;
let foto = null;
let revisando = false;

const vivo = {
  activo: false,
  intervalo: 20,
  faltan: 20,
  enviando: false,
  timer: null,
  firma: null,
  consejos: [],
};

export const dibujo = {
  iniciar,
  actualizar,
  pausar,
  ocupado: () => Boolean(stream) || revisando || vivo.enviando,
  configurar: (c) => {
    vivo.intervalo = Number(c?.intervaloVivo) || 20;
  },
};

function pausar() {
  if (stream) {
    cerrarCamara();
    estado('inicial');
  }
}

function iniciar() {
  $('#di-ejercicio').addEventListener('change', (e) => elegir(e.target.value));
  $('#di-abrir').addEventListener('click', abrirCamara);
  $('#di-tomar').addEventListener('click', tomarFoto);
  $('#di-otra').addEventListener('click', abrirCamara);
  $('#di-pausar').addEventListener('click', alternarVivo);
  $('#di-cerrar').addEventListener('click', () => {
    cerrarCamara();
    $('#di-resultado').hidden = true;
    estado('inicial');
  });
  $('#di-revisar').addEventListener('click', revisar);
  estado('inicial');
}

function actualizar(lista) {
  ejercicios = lista;
  const sel = $('#di-ejercicio');
  const previo = actual?.id;
  sel.innerHTML = lista.map((e) => `<option value="${esc(e.id)}">${esc(e.titulo)}</option>`).join('');
  elegir(lista.some((e) => e.id === previo) ? previo : lista[0]?.id);
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
  $('#di-minutos').textContent = `Tiempo sugerido: ${actual.minutos} min`;
  if (cambio) {
    vivo.consejos = [];
    pintarHistorial();
  }
}

// ---------------------------------------------------------------- cámara

async function abrirCamara() {
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
    iniciarVivo();
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

// ---------------------------------------------------------------- en vivo

function iniciarVivo() {
  vivo.activo = true;
  vivo.firma = null;
  vivo.faltan = 4; // primer vistazo rápido
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
}

function alternarVivo() {
  if (vivo.activo) {
    detenerVivo();
    pintarVivo();
  } else if (stream) {
    iniciarVivo();
  }
}

function pintarVivo() {
  $('#di-pausar').textContent = vivo.activo ? 'Pausar en vivo' : 'Reanudar en vivo';
  const e = $('#di-vivo-estado');
  if (!vivo.activo) e.textContent = 'En pausa';
  else if (vivo.enviando) e.textContent = 'Viendo tu hoja…';
  else e.textContent = `En vivo · próximo vistazo en ${vivo.faltan} s`;
  e.dataset.activo = String(vivo.activo);
}

async function tic() {
  if (!vivo.activo || !stream) return;
  if (vivo.enviando) return pintarVivo();
  vivo.faltan--;
  if (vivo.faltan > 0) return pintarVivo();
  vivo.faltan = vivo.intervalo;

  const cap = capturar(LADO_VIVO, 0.75);
  if (!cap) return pintarVivo();
  const firma = firmaImagen(cap.canvas);
  if (vivo.firma && diferencia(firma, vivo.firma) < UMBRAL_CAMBIO) {
    $('#di-vivo-estado').textContent = 'Sin cambios en la hoja';
    return;
  }
  vivo.enviando = true;
  pintarVivo();
  try {
    const r = await fetch('/api/dibujo/vivo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imagen: cap.url, ejercicio: actual?.id ?? null, previos: vivo.consejos.slice(-4) }),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) {
      $('#di-vivo-texto').textContent = datos.error || `El servidor respondió ${r.status}.`;
      if (r.status === 429) detenerVivo();
    } else {
      vivo.firma = firma;
      vivo.consejos.push(datos.consejo);
      $('#di-vivo-texto').textContent = datos.consejo;
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

// ---------------------------------------------------------------- revisión completa

function tomarFoto() {
  const cap = capturar(LADO_MAX, 0.85);
  if (!cap) return;
  foto = cap.url;
  cerrarCamara();
  $('#di-foto').src = foto;
  estado('foto');
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
    $('#di-resultado').innerHTML = formatear(datos.comentario);
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
  if (e === 'camara' || e === 'revisando') $('#di-resultado').hidden = true;
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
