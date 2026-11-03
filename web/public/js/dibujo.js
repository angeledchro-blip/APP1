// Vista de dibujo: ruta de ejercicios; le tomas foto a tu hoja y la IA te corrige y te califica.
import { progreso } from './progreso.js';

const $ = (sel) => document.querySelector(sel);
const LADO_MAX = 1600; // lado más largo de la foto que se manda a revisar

// La app 1.2+ abre la cámara del teléfono. Las versiones viejas de la app (WebView sin selector de archivos)
// no pueden abrirla, así que ahí se toma la foto con la cámara dentro de la app.
const enAppVieja = /; wv\)/.test(navigator.userAgent) && !(Number(window.AndroidApp?.version?.()) >= 3);

let ejercicios = [];
let actual = null;
let elegidoAMano = false;
let aprobar = 3;
let foto = null;
let revisando = false;
let esperandoFoto = false;
let esperaTimer = null;
let stream = null; // solo en la app vieja
let pantalla = 'inicial';

export const dibujo = {
  iniciar,
  actualizar,
  pausar,
  // No recargar la app mientras se toma, se revisa o se lee una corrección
  ocupado: () => revisando || esperandoFoto || Boolean(stream) || pantalla === 'foto' || pantalla === 'resultado',
  configurar: (c) => {
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
    $('#di-resultado').hidden = true;
    foto = null;
    estado('inicial');
  });
  $('#di-tomar').addEventListener('click', tomar);
  $('#di-otra').addEventListener('click', tomar);
  $('#di-galeria').addEventListener('click', () => abrirSelector($('#di-archivo-galeria')));
  $('#di-disparar').addEventListener('click', disparar);
  $('#di-cancelar').addEventListener('click', () => {
    cerrarCamara();
    estado('inicial');
  });
  $('#di-revisar').addEventListener('click', revisar);
  $('#di-siguiente').addEventListener('click', () => {
    const sig = ejercicioActual();
    if (!sig) return;
    elegidoAMano = false;
    elegir(sig.id);
    foto = null;
    $('#di-resultado').hidden = true;
    estado('inicial');
    $('#vista-dibujo').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  for (const id of ['#di-archivo-camara', '#di-archivo-galeria']) {
    const input = $(id);
    input.addEventListener('change', () => {
      dejarDeEsperar();
      const archivo = input.files?.[0];
      input.value = '';
      if (archivo) cargarArchivo(archivo);
    });
    input.addEventListener('cancel', dejarDeEsperar);
  }
  progreso.alCambiar(() => pintarRuta());
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
      const marca = est === 'aprobado' ? '✓ ' : est === 'actual' ? '▶ ' : '🔒 ';
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
  actual = ejercicios.find((e) => e.id === id) || null;
  if (!actual) return;
  $('#di-ejercicio').value = actual.id;
  $('#di-titulo').textContent = actual.titulo;
  $('#di-objetivo').textContent = actual.objetivo;
  $('#di-instrucciones').textContent = actual.instrucciones;
  $('#di-criterios').textContent = actual.criterios;
  $('#di-minutos').textContent = `Tiempo sugerido: ${actual.minutos} min`;
  pintarEstado();
}

// ---------------------------------------------------------------- foto

function tomar() {
  if (enAppVieja) abrirCamara();
  else abrirSelector($('#di-archivo-camara'));
}

function abrirSelector(input) {
  esperandoFoto = true;
  clearTimeout(esperaTimer);
  esperaTimer = setTimeout(dejarDeEsperar, 180000);
  input.click();
}

function dejarDeEsperar() {
  esperandoFoto = false;
  clearTimeout(esperaTimer);
}

async function cargarArchivo(archivo) {
  try {
    mostrarFoto(await reducirImagen(archivo));
  } catch {
    mostrarError('No pude abrir esa imagen. Toma la foto otra vez.');
    estado(foto ? 'foto' : 'inicial');
  }
}

// Baja la foto a 1600 px por lado (las del cel pesan varios MB) respetando cómo se tomó (vertical u horizontal)
async function reducirImagen(archivo) {
  let fuente;
  try {
    fuente = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    fuente = await cargarImg(archivo);
  }
  const canvas = lienzo(fuente, fuente.width, fuente.height);
  fuente.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}

function cargarImg(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      mal(e);
    };
    img.src = url;
  });
}

function lienzo(fuente, w, h) {
  const k = Math.min(1, LADO_MAX / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext('2d').drawImage(fuente, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function mostrarFoto(url) {
  foto = url;
  $('#di-foto').src = url;
  $('#di-resultado').hidden = true;
  estado('foto');
  $('.camara').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// Cámara dentro de la app: solo para la versión vieja de la app
async function abrirCamara() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este dispositivo no deja usar la cámara desde aquí.');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    const v = $('#di-video');
    v.srcObject = stream;
    await v.play().catch(() => {});
    $('#di-resultado').hidden = true;
    estado('camara');
    $('.camara').scrollIntoView({ block: 'start', behavior: 'smooth' });
  } catch (err) {
    stream = null;
    mostrarError(
      err?.name === 'NotAllowedError'
        ? 'La app no tiene permiso de usar la cámara. Dale permiso en Ajustes del teléfono > Apps > Práctica > Permisos.'
        : 'No se pudo abrir la cámara: ' + (err?.message || err)
    );
    estado('inicial');
  }
}

function disparar() {
  const v = $('#di-video');
  if (!v.videoWidth) return;
  const url = lienzo(v, v.videoWidth, v.videoHeight).toDataURL('image/jpeg', 0.85);
  cerrarCamara();
  mostrarFoto(url);
}

function cerrarCamara() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  const v = $('#di-video');
  if (v) v.srcObject = null;
}

// ---------------------------------------------------------------- revisión

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
    let haySiguiente = false;
    if (datos.nivel !== null && datos.nivel !== undefined) {
      if (datos.aprobado) {
        progreso.cargar({ [`dibujo:${actual.id}`]: String(Math.max(datos.nivel, calificacion(actual.id))) });
        const sig = ejercicioActual();
        haySiguiente = Boolean(sig && sig.id !== actual.id);
        encabezado = `<p class="calificacion aprobado">✓ ¡Aprobado con ${datos.nivel}/5!${
          sig ? ` Ya puedes pasar a "${esc(sig.titulo)}".` : ' Terminaste toda la ruta.'
        }</p>`;
      } else {
        encabezado = `<p class="calificacion">Sacaste ${datos.nivel}/5. Para aprobar necesitas ${aprobar}. Practica lo que te marco y vuelve a tomarle foto.</p>`;
      }
    }
    $('#di-resultado').innerHTML = encabezado + formatear(datos.comentario);
    $('#di-resultado').hidden = false;
    $('#di-nota').value = '';
    estado('resultado');
    $('#di-siguiente').hidden = !haySiguiente;
    $('#di-resultado').scrollIntoView({ block: 'start', behavior: 'smooth' });
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

// Pantallas: inicial → (camara, solo app vieja) → foto → revisando → resultado
function estado(e) {
  pantalla = e;
  const ver = (id, si) => ($(id).hidden = !si);
  ver('#di-vacio', e === 'inicial');
  ver('#di-video', e === 'camara');
  ver('#di-foto', e === 'foto' || e === 'revisando' || e === 'resultado');
  ver('#di-cargando', e === 'revisando');
  ver('#di-tomar', e === 'inicial');
  ver('#di-galeria', e === 'inicial' && !enAppVieja);
  ver('#di-disparar', e === 'camara');
  ver('#di-cancelar', e === 'camara');
  ver('#di-nota-campo', e === 'foto');
  ver('#di-revisar', e === 'foto');
  ver('#di-otra', e === 'foto' || e === 'resultado');
  $('#di-otra').textContent = e === 'resultado' ? 'Tomar otra foto' : 'Tomar otra';
  if (e !== 'resultado') $('#di-siguiente').hidden = true;
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
