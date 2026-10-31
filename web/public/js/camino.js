// Camino de guitarra: niveles que desbloquean acordes y se pasan con un reto.
import { diagramaAcorde } from './acordes.js';
import { progreso } from './progreso.js';

const $ = (s) => document.querySelector(s);

let niveles = [];
let acordes = [];
let rutinas = [];
let viendo = null; // nivel que se está mostrando en la tarjeta
let acciones = null; // { practicar(practica), reto(nivel) }

export const camino = {
  iniciar,
  actualizar,
  pintar,
  nivelActual,
  desbloqueados,
  nivelDeAcorde,
  nivelDeRutina,
  subirNivel,
  textoReto,
};

function iniciar(deps) {
  acciones = deps;
  $('#ca-lista').addEventListener('click', (e) => {
    const li = e.target.closest('[data-nivel]');
    if (!li) return;
    viendo = Number(li.dataset.nivel);
    pintar();
    $('#ca-actual').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $('#ca-practicar').addEventListener('click', () => {
    const n = niveles[viendo - 1];
    if (n) acciones.practicar(n.practica);
  });
  $('#ca-reto').addEventListener('click', () => {
    const n = niveles[viendo - 1];
    if (n && viendo === nivelActual()) acciones.reto(n, viendo);
  });
  progreso.alCambiar(() => pintar());
}

function actualizar(n, a, r) {
  niveles = n;
  acordes = a;
  rutinas = r;
  pintar();
}

function nivelActual() {
  return Math.max(1, Math.min(niveles.length + 1 || 1, progreso.numero('guitarra:nivel', 1)));
}

function listaAcordes(n) {
  return String(n?.acordes || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

// Acordes que ya se pueden usar (los de los niveles alcanzados)
function desbloqueados() {
  const set = new Set();
  const hasta = nivelActual();
  niveles.forEach((n, i) => {
    if (i + 1 <= hasta) listaAcordes(n).forEach((a) => set.add(a));
  });
  return set;
}

function nivelDeAcorde(id) {
  const i = niveles.findIndex((n) => listaAcordes(n).includes(id));
  return i >= 0 ? i + 1 : 1;
}

function nivelDeRutina(r) {
  return Math.max(
    1,
    ...String(r.secuencia)
      .split(',')
      .map((x) => nivelDeAcorde(x.trim()))
  );
}

async function subirNivel(desde) {
  if (desde !== nivelActual()) return;
  await progreso.guardar('guitarra:nivel', desde + 1);
  viendo = desde + 1;
  pintar();
}

function textoReto(n) {
  const [a, b] = String(n.reto_param).split(',');
  if (n.reto_tipo === 'repite') return `Haz sonar ${a} limpio ${n.reto_meta} veces (suelta los dedos y vuelve a ponerlo cada vez).`;
  if (n.reto_tipo === 'cambios') return `Haz ${n.reto_meta} cambios limpios entre ${a} y ${b} en 1 minuto.`;
  const r = rutinas.find((x) => x.id === n.reto_param);
  return `Toca "${r ? r.titulo : n.reto_param}" a ${n.reto_meta} BPM con al menos 80% de los compases a tiempo.`;
}

function pintar() {
  if (!niveles.length) return;
  const actual = nivelActual();
  if (!viendo || viendo > niveles.length) viendo = Math.min(actual, niveles.length);
  const n = niveles[viendo - 1];
  const terminado = actual > niveles.length;
  const estado = viendo < actual ? 'pasado' : viendo === actual ? 'actual' : 'bloqueado';

  $('#ca-num').textContent = terminado && viendo === niveles.length ? '¡Terminaste el camino!' : `Nivel ${viendo} de ${niveles.length}`;
  $('#ca-titulo').textContent = n.titulo;
  $('#ca-desc').textContent = n.descripcion;
  const nuevos = listaAcordes(n)
    .map((id) => acordes.find((a) => a.id === id))
    .filter(Boolean);
  $('#ca-acordes').innerHTML = nuevos
    .map((a) => `<figure class="mini-acorde fijo">${diagramaAcorde(a)}<figcaption>${a.nombre}</figcaption></figure>`)
    .join('');
  $('#ca-acordes').hidden = !nuevos.length;
  $('#ca-reto-texto').textContent = textoReto(n);
  const boton = $('#ca-reto');
  const aviso = $('#ca-aviso');
  if (estado === 'pasado') {
    boton.hidden = true;
    aviso.textContent = '✓ Ya pasaste este nivel. Puedes practicarlo cuando quieras.';
  } else if (estado === 'bloqueado') {
    boton.hidden = true;
    aviso.textContent = `🔒 Se desbloquea al pasar el nivel ${viendo - 1}. Puedes verlo y practicarlo, pero el reto se abre después.`;
  } else {
    boton.hidden = false;
    aviso.textContent = '';
  }
  $('#ca-actual').dataset.estado = estado;

  $('#ca-lista').innerHTML = niveles
    .map((x, i) => {
      const num = i + 1;
      const est = num < actual ? 'pasado' : num === actual ? 'actual' : 'bloqueado';
      const marca = est === 'pasado' ? '✓' : est === 'actual' ? String(num) : '🔒';
      const acs = listaAcordes(x).join(', ');
      return `<li data-nivel="${num}" data-estado="${est}" ${num === viendo ? 'aria-current="true"' : ''}>
        <span class="marca">${marca}</span>
        <span class="info"><strong>${esc(x.titulo)}</strong>${acs ? `<small>${esc(acs)}</small>` : ''}</span>
      </li>`;
    })
    .join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
