// Vista de dibujo: ejercicio, cámara, foto y revisión con IA.
const $ = (sel) => document.querySelector(sel);
const LADO_MAX = 1600;

let ejercicios = [];
let actual = null;
let stream = null;
let foto = null;
let revisando = false;

export const dibujo = {
  iniciar,
  actualizar,
  pausar,
  ocupado: () => Boolean(stream) || revisando,
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
  actual = ejercicios.find((e) => e.id === id) || null;
  if (!actual) return;
  $('#di-ejercicio').value = actual.id;
  $('#di-titulo').textContent = actual.titulo;
  $('#di-objetivo').textContent = actual.objetivo;
  $('#di-instrucciones').textContent = actual.instrucciones;
  $('#di-criterios').textContent = actual.criterios;
  $('#di-minutos').textContent = `Tiempo sugerido: ${actual.minutos} min`;
}

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
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  const v = $('#di-video');
  if (v) v.srcObject = null;
}

function tomarFoto() {
  const v = $('#di-video');
  const w = v.videoWidth;
  const h = v.videoHeight;
  if (!w || !h) return;
  const escala = Math.min(1, LADO_MAX / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
  foto = canvas.toDataURL('image/jpeg', 0.85);
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
  ver('#di-foto', e === 'foto' || e === 'revisando' || e === 'resultado');
  ver('#di-vacio', e === 'inicial');
  ver('#di-abrir', e === 'inicial');
  ver('#di-tomar', e === 'camara');
  ver('#di-cerrar', e === 'camara');
  ver('#di-revisar', e === 'foto');
  ver('#di-otra', e === 'foto' || e === 'resultado');
  ver('#di-nota-campo', e === 'foto');
  ver('#di-cargando', e === 'revisando');
  $('#di-otra').textContent = e === 'resultado' ? 'Revisar otro dibujo' : 'Tomar otra';
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
