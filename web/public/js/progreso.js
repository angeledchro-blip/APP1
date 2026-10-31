// Progreso guardado en la base de datos (niveles, récords, ejercicios aprobados).
// Se lee junto con el contenido y se escribe con /api/progreso; también queda una copia en el teléfono.

let datos = leerCopia();
const oyentes = new Set();

function leerCopia() {
  try {
    return JSON.parse(localStorage.getItem('progreso') || '{}');
  } catch {
    return {};
  }
}

function guardarCopia() {
  try {
    localStorage.setItem('progreso', JSON.stringify(datos));
  } catch {
    /* sin almacenamiento */
  }
}

export const progreso = {
  // Llega del servidor: manda lo del servidor, pero no pierde lo que aún no se subía
  cargar(delServidor = {}) {
    const antes = JSON.stringify(datos);
    datos = { ...datos, ...delServidor };
    guardarCopia();
    if (JSON.stringify(datos) !== antes) oyentes.forEach((fn) => fn());
  },
  leer(clave, porDefecto = null) {
    return datos[clave] ?? porDefecto;
  },
  numero(clave, porDefecto = 0) {
    const v = Number(datos[clave]);
    return Number.isFinite(v) ? v : porDefecto;
  },
  async guardar(clave, valor) {
    datos[clave] = String(valor);
    guardarCopia();
    oyentes.forEach((fn) => fn());
    try {
      await fetch('/api/progreso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clave, valor: String(valor) }),
      });
    } catch {
      /* se vuelve a subir la próxima vez que cambie */
    }
  },
  alCambiar(fn) {
    oyentes.add(fn);
  },
};
