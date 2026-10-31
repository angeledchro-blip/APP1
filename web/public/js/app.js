// Arranque de la app: pestañas, sincronización en tiempo real con la base de datos y avisos.
import { guitarra } from './guitarra.js';
import { dibujo } from './dibujo.js';

const $ = (sel) => document.querySelector(sel);
const CADA_MS = 30000;

let build = null;
let firma = null;
let recargaPendiente = false;
let vista = 'guitarra';

function leerVista() {
  try {
    return localStorage.getItem('vista') || 'guitarra';
  } catch {
    return 'guitarra';
  }
}

function guardarVista(v) {
  try {
    localStorage.setItem('vista', v);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

function cambiarVista(v) {
  vista = v;
  guardarVista(v);
  document.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === v)));
  $('#vista-dibujo').hidden = v !== 'dibujo';
  $('#vista-guitarra').hidden = v !== 'guitarra';
  // Libera micrófono o cámara de la vista que se deja
  if (v === 'dibujo') guitarra.pausar();
  else dibujo.pausar();
}

function estado(texto, tipo) {
  const el = $('#estado');
  el.textContent = texto;
  el.dataset.tipo = tipo;
}

function aviso(texto) {
  const t = $('#toast');
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(aviso.timer);
  aviso.timer = setTimeout(() => (t.hidden = true), 3200);
}

async function sincronizar(inicial = false) {
  try {
    const r = await fetch('/api/contenido', { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const datos = await r.json();
    estado('Conectado', 'ok');

    if (build && datos.build && datos.build !== build) {
      recargaPendiente = true;
      intentarRecarga();
      return;
    }
    build = datos.build;

    const nueva = JSON.stringify(datos.contenido);
    if (nueva !== firma) {
      firma = nueva;
      aplicar(datos.contenido);
      if (!inicial) aviso('Se actualizó el contenido.');
    }
  } catch {
    estado('Sin conexión', 'error');
  }
}

function aplicar(c) {
  const m = $('#mensaje');
  m.textContent = c.mensaje || '';
  m.hidden = !c.mensaje;
  guitarra.actualizar(c);
  dibujo.actualizar(c.ejercicios || []);
}

// Hay versión nueva de la app: recarga cuando no estés usando micrófono, cámara o esperando una revisión.
function intentarRecarga() {
  if (!recargaPendiente) return;
  if (guitarra.ocupado() || dibujo.ocupado()) {
    estado('Actualización lista', 'ok');
    return;
  }
  location.reload();
}

function arrancar() {
  document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => cambiarVista(b.dataset.vista)));
  $('#mensaje').addEventListener('click', (e) => e.currentTarget.classList.toggle('abierto'));
  guitarra.iniciar();
  dibujo.iniciar();
  cambiarVista(leerVista());
  sincronizar(true);
  setInterval(() => {
    if (!document.hidden) sincronizar();
  }, CADA_MS);
  setInterval(intentarRecarga, 3000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      guitarra.pausar();
      dibujo.pausar();
    } else {
      sincronizar();
    }
  });
}

arrancar();
