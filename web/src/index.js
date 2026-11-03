import { SEED_VERSION, ESQUEMA, CONFIG, ACORDES, RUTINAS, LECCIONES, EJERCICIOS, NIVELES } from './seed.js';
import { IMAGEN_PRUEBA } from './diagnostico.js'; // TEMPORAL

const MAX_IMAGEN_BYTES = 6 * 1024 * 1024;
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    try {
      await asegurarBase(env);
      if (url.pathname === '/api/contenido' && request.method === 'GET') {
        return await contenido(env);
      }
      if (url.pathname === '/api/dibujo/revisar' && request.method === 'POST') {
        return await revisarDibujo(request, env);
      }
      if (url.pathname === '/api/diagnostico-ia' && request.method === 'GET') {
        return await diagnosticoIA(env); // TEMPORAL
      }
      if (url.pathname === '/api/progreso' && request.method === 'POST') {
        return await guardarProgreso(request, env);
      }
      return json({ error: 'Ruta no encontrada.' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'Error del servidor: ' + (err?.message || String(err)) }, 500);
    }
  },
};

// ---------- Base de datos ----------

let basePromesa = null;

function asegurarBase(env) {
  if (!basePromesa) {
    basePromesa = prepararBase(env).catch((err) => {
      basePromesa = null;
      throw err;
    });
  }
  return basePromesa;
}

async function prepararBase(env) {
  await env.DB.batch(ESQUEMA.map((sql) => env.DB.prepare(sql)));
  const fila = await env.DB.prepare("SELECT valor FROM config WHERE clave = 'seed_version'").first();
  if (!fila || Number(fila.valor) < SEED_VERSION) {
    await sembrar(env);
  }
}

async function sembrar(env) {
  const db = env.DB;
  const st = [];
  for (const [clave, valor] of Object.entries(CONFIG)) {
    st.push(db.prepare('INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)').bind(clave, valor));
  }
  ACORDES.forEach(([id, nombre, trastes, dedos, cejilla, nivel], i) => {
    st.push(
      db
        .prepare(
          `INSERT INTO acordes (id, nombre, trastes, dedos, cejilla, nivel, orden) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, trastes = excluded.trastes, dedos = excluded.dedos,
             cejilla = excluded.cejilla, nivel = excluded.nivel, orden = excluded.orden`
        )
        .bind(id, nombre, trastes, dedos, cejilla, nivel, i)
    );
  });
  RUTINAS.forEach(([id, titulo, descripcion, secuencia, nivel], i) => {
    st.push(
      db
        .prepare(
          `INSERT INTO rutinas (id, titulo, descripcion, secuencia, nivel, orden) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET titulo = excluded.titulo, descripcion = excluded.descripcion,
             secuencia = excluded.secuencia, nivel = excluded.nivel, orden = excluded.orden`
        )
        .bind(id, titulo, descripcion, secuencia, nivel, i)
    );
  });
  LECCIONES.forEach(([id, titulo, descripcion, notas], i) => {
    st.push(
      db
        .prepare(
          `INSERT INTO lecciones (id, titulo, descripcion, notas, orden) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET titulo = excluded.titulo, descripcion = excluded.descripcion,
             notas = excluded.notas, orden = excluded.orden`
        )
        .bind(id, titulo, descripcion, notas, i)
    );
  });
  EJERCICIOS.forEach(([id, titulo, objetivo, instrucciones, criterios, minutos, nivel], i) => {
    st.push(
      db
        .prepare(
          `INSERT INTO ejercicios (id, titulo, objetivo, instrucciones, criterios, minutos, nivel, orden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET titulo = excluded.titulo, objetivo = excluded.objetivo,
             instrucciones = excluded.instrucciones, criterios = excluded.criterios, minutos = excluded.minutos,
             nivel = excluded.nivel, orden = excluded.orden`
        )
        .bind(id, titulo, objetivo, instrucciones, criterios, minutos, nivel, i)
    );
  });
  NIVELES.forEach(([id, titulo, descripcion, acordes, practica, retoTipo, retoParam, retoMeta], i) => {
    st.push(
      db
        .prepare(
          `INSERT INTO niveles (id, orden, titulo, descripcion, acordes, practica, reto_tipo, reto_param, reto_meta)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET orden = excluded.orden, titulo = excluded.titulo, descripcion = excluded.descripcion,
             acordes = excluded.acordes, practica = excluded.practica, reto_tipo = excluded.reto_tipo,
             reto_param = excluded.reto_param, reto_meta = excluded.reto_meta`
        )
        .bind(id, i + 1, titulo, descripcion, acordes, practica, retoTipo, retoParam, retoMeta)
    );
  });
  st.push(
    db
      .prepare(
        "INSERT INTO config (clave, valor) VALUES ('seed_version', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor"
      )
      .bind(String(SEED_VERSION))
  );
  await db.batch(st);
}

async function leerConfig(env) {
  const { results } = await env.DB.prepare('SELECT clave, valor FROM config').all();
  const config = {};
  for (const r of results) config[r.clave] = r.valor;
  return config;
}

// ---------- API: contenido ----------

async function contenido(env) {
  const [config, acordes, rutinas, lecciones, ejercicios, niveles, progreso] = await Promise.all([
    leerConfig(env),
    env.DB.prepare('SELECT id, nombre, trastes, dedos, cejilla, nivel FROM acordes WHERE activo = 1 ORDER BY orden, nombre').all(),
    env.DB.prepare('SELECT id, titulo, descripcion, secuencia, nivel FROM rutinas WHERE activo = 1 ORDER BY orden, titulo').all(),
    env.DB.prepare('SELECT id, titulo, descripcion, notas FROM lecciones WHERE activo = 1 ORDER BY orden, titulo').all(),
    env.DB.prepare(
      'SELECT id, titulo, objetivo, instrucciones, criterios, minutos, nivel FROM ejercicios WHERE activo = 1 ORDER BY orden, titulo'
    ).all(),
    env.DB.prepare(
      'SELECT id, titulo, descripcion, acordes, practica, reto_tipo, reto_param, reto_meta FROM niveles WHERE activo = 1 ORDER BY orden'
    ).all(),
    env.DB.prepare('SELECT clave, valor FROM progreso').all(),
  ]);
  const prog = {};
  for (const r of progreso.results) prog[r.clave] = r.valor;
  return json(
    {
      build: env.CF_VERSION_METADATA?.id || null,
      ia: env.ANTHROPIC_API_KEY ? 'claude' : 'workers-ai',
      contenido: {
        mensajes: {
          guitarra: config.mensaje_guitarra || '',
          dibujo: config.mensaje_dibujo || '',
        },
        aprobarDibujo: Number(config.aprobar_dibujo || 3),
        niveles: niveles.results,
        progreso: prog,
        acordes: acordes.results,
        rutinas: rutinas.results,
        lecciones: lecciones.results,
        ejercicios: ejercicios.results,
      },
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}

// ---------- API: revisar dibujo ----------

async function revisarDibujo(request, env) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: 'La petición no trae JSON válido.' }, 400);
  }
  const imagen = parsearImagen(cuerpo?.imagen);
  if (!imagen) {
    return json({ error: 'No llegó la foto (o no es JPG, PNG o WEBP). Toma la foto otra vez.' }, 400);
  }
  if (imagen.bytes > MAX_IMAGEN_BYTES) {
    return json({ error: 'La foto pesa demasiado. Tómala de nuevo.' }, 413);
  }

  const config = await leerConfig(env);
  const limite = Number(config.limite_revisiones_dia || 40);
  const hoy = new Date().toISOString().slice(0, 10);
  const conteo = await env.DB.prepare('SELECT COUNT(*) AS n FROM revisiones WHERE fecha >= ?').bind(hoy).first();
  if (limite > 0 && conteo.n >= limite) {
    return json({ error: `Ya llegaste al límite de ${limite} revisiones por hoy. Mañana se reinicia.` }, 429);
  }

  const ejercicioId = typeof cuerpo.ejercicio === 'string' ? cuerpo.ejercicio : null;
  const ejercicio = ejercicioId
    ? await env.DB.prepare('SELECT * FROM ejercicios WHERE id = ?').bind(ejercicioId).first()
    : null;
  const nota = typeof cuerpo.nota === 'string' ? cuerpo.nota.slice(0, 500).trim() : '';
  const historial = ejercicioId
    ? (
        await env.DB.prepare(
          'SELECT fecha, comentario FROM revisiones WHERE ejercicio_id = ? ORDER BY id DESC LIMIT 3'
        )
          .bind(ejercicioId)
          .all()
      ).results
    : [];

  const texto = armarPeticion(ejercicio, nota, historial);
  let resultado;
  try {
    resultado = env.ANTHROPIC_API_KEY
      ? await revisarConClaude(env, imagen, texto, SISTEMA, config.modelo_claude || 'claude-sonnet-5-5', 3000)
      : await revisarConWorkersAI(env, config, imagen, texto, SISTEMA, 900);
  } catch (err) {
    console.error(err);
    return json({ error: 'La IA no pudo revisar la foto: ' + (err?.message || String(err)) }, 502);
  }
  if (!resultado.texto) {
    return json({ error: 'La IA respondió vacío. Intenta otra vez.' }, 502);
  }

  await env.DB.prepare('INSERT INTO revisiones (ejercicio_id, fecha, motor, nota, comentario) VALUES (?, ?, ?, ?, ?)')
    .bind(ejercicioId, new Date().toISOString(), resultado.motor, nota, resultado.texto)
    .run();

  // Calificación que da la IA ("Nivel en este ejercicio: X/5") → aprueba el ejercicio si llega al mínimo
  const nivel = leerCalificacion(resultado.texto);
  const minimo = Number(config.aprobar_dibujo || 3);
  let aprobado = false;
  if (ejercicio && nivel !== null && nivel >= minimo) {
    aprobado = true;
    await env.DB.prepare(
      `INSERT INTO progreso (clave, valor, fecha) VALUES (?, ?, ?)
       ON CONFLICT(clave) DO UPDATE SET valor = MAX(CAST(progreso.valor AS INTEGER), CAST(excluded.valor AS INTEGER)), fecha = excluded.fecha`
    )
      .bind(`dibujo:${ejercicio.id}`, String(nivel), new Date().toISOString())
      .run();
  }
  return json({ comentario: resultado.texto, motor: resultado.motor, nivel, aprobado });
}

function leerCalificacion(texto) {
  const m = /nivel[^0-9\n]{0,40}?([0-5])\s*\/\s*5/i.exec(String(texto || ''));
  return m ? Number(m[1]) : null;
}

// ---------- API: progreso ----------

async function guardarProgreso(request, env) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: 'La petición no trae JSON válido.' }, 400);
  }
  const clave = typeof cuerpo?.clave === 'string' ? cuerpo.clave : '';
  const valor = cuerpo?.valor === undefined || cuerpo?.valor === null ? '' : String(cuerpo.valor);
  if (!/^[a-z0-9_:\-]{1,80}$/i.test(clave) || clave.startsWith('dibujo:') || valor.length > 200) {
    return json({ error: 'Dato de progreso inválido.' }, 400);
  }
  await env.DB.prepare(
    'INSERT INTO progreso (clave, valor, fecha) VALUES (?, ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, fecha = excluded.fecha'
  )
    .bind(clave, valor, new Date().toISOString())
    .run();
  return json({ ok: true });
}

function parsearImagen(valor) {
  if (typeof valor !== 'string') return null;
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(valor.trim());
  if (!m || !TIPOS_IMAGEN.includes(m[1])) return null;
  const b64 = m[2];
  return { tipo: m[1], b64, bytes: Math.floor((b64.length * 3) / 4) };
}

const SISTEMA = `Eres el maestro de dibujo de Sky dentro de su app de práctica. Sky está aprendiendo a dibujar desde cero, con lápiz y papel. Te manda la foto de lo que acaba de dibujar para un ejercicio.

Cómo respondes:
- En español de México, en tono cercano y relajado, como un compa que sabe dibujar. Sin groserías y sin exagerar con modismos.
- Honesto y concreto. Si algo está mal, dilo claro y explica cómo arreglarlo. Nada de elogios vacíos.
- Habla solo de lo que de verdad se ve en la foto. Si la foto sale borrosa, oscura o no se alcanza a ver el dibujo, dilo y pide otra foto en lugar de inventar.
- Corto, para leerse en el celular. Usa exactamente este formato:

**Lo que va bien**
- (1 a 3 puntos)

**Qué corregir**
- (1 a 3 puntos, el más importante primero, cada uno con cómo arreglarlo)

**Tu siguiente práctica**
(un ejercicio concreto: qué dibujar, cuántas veces o cuántos minutos y en qué fijarte)

**Nivel en este ejercicio:** X/5

Cómo calificar (Sky es principiante; la calificación decide si pasa al siguiente ejercicio de su ruta):
- Califica contra el objetivo de ESTE ejercicio, no contra un artista profesional.
- 1/5: casi no se intentó o no sigue las instrucciones. 2/5: lo intenta, pero falla lo principal del ejercicio.
- 3/5: cumple lo básico del objetivo aunque tenga errores; ya puede pasar al siguiente.
- 4/5: lo cumple bien con detalles menores. 5/5: muy limpio y constante en toda la hoja.
- Si la foto no deja ver el dibujo, no califiques: escribe "Nivel en este ejercicio: sin calificar" y pide otra foto.`;

function armarPeticion(ejercicio, nota, historial) {
  const partes = [];
  if (ejercicio) {
    partes.push(
      `Ejercicio: ${ejercicio.titulo}`,
      `Objetivo: ${ejercicio.objetivo}`,
      `Instrucciones que siguió: ${ejercicio.instrucciones}`,
      `Fíjate sobre todo en: ${ejercicio.criterios}`
    );
  } else {
    partes.push('Es un dibujo libre, sin ejercicio específico.');
  }
  if (nota) partes.push(`Sky pregunta o comenta: "${nota}"`);
  if (historial.length) {
    partes.push(
      'Tus revisiones anteriores de este mismo ejercicio (de la más reciente a la más vieja). Compara y dile si mejoró en lo que le corregiste:'
    );
    for (const h of historial) {
      partes.push(`[${h.fecha.slice(0, 10)}] ${h.comentario.slice(0, 600)}`);
    }
  }
  partes.push('Revisa el dibujo de la foto.');
  return partes.join('\n');
}

async function revisarConClaude(env, imagen, texto, sistema, modelo, maxTokens) {
  const cuerpo = {
    model: modelo,
    max_tokens: maxTokens,
    output_config: { effort: 'low' },
    system: sistema,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imagen.tipo, data: imagen.b64 } },
          { type: 'text', text: texto },
        ],
      },
    ],
  };
  let r = await llamarClaude(env, cuerpo);
  if (r.status === 400) {
    // Por si el modelo configurado no acepta el ajuste de esfuerzo: reintenta sin él.
    delete cuerpo.output_config;
    r = await llamarClaude(env, cuerpo);
  }
  if (!r.ok) {
    throw new Error(`Claude respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const datos = await r.json();
  const salida = (datos.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { texto: salida, motor: modelo };
}

function llamarClaude(env, cuerpo) {
  const base = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  return fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(cuerpo),
  });
}

async function revisarConWorkersAI(env, config, imagen, texto, sistema, maxTokens) {
  if (!env.AI) throw new Error('no hay IA conectada (falta el binding AI en Cloudflare).');
  const modelo = config.modelo_workers_ai || '@cf/meta/llama-4-scout-17b-16e-instruct';
  const r = await env.AI.run(modelo, {
    messages: [
      { role: 'system', content: sistema },
      {
        role: 'user',
        content: [
          { type: 'text', text: texto },
          { type: 'image_url', image_url: { url: `data:${imagen.tipo};base64,${imagen.b64}` } },
        ],
      },
    ],
    max_tokens: maxTokens,
    temperature: 0.4,
  });
  const salida =
    typeof r === 'string' ? r : r?.response ?? r?.result?.response ?? r?.choices?.[0]?.message?.content ?? '';
  return { texto: String(salida).trim(), motor: modelo };
}

// TEMPORAL: prueba la revisión con la IA real usando una foto de prueba (no guarda nada)
async function diagnosticoIA(env) {
  const config = await leerConfig(env);
  const imagen = parsearImagen(IMAGEN_PRUEBA);
  const ejercicio = await env.DB.prepare('SELECT * FROM ejercicios WHERE id = ?').bind('lineas-hombro').first();
  const texto = armarPeticion(ejercicio, '', []);
  const inicio = Date.now();
  try {
    const r = env.ANTHROPIC_API_KEY
      ? await revisarConClaude(env, imagen, texto, SISTEMA, config.modelo_claude || 'claude-sonnet-5-5', 3000)
      : await revisarConWorkersAI(env, config, imagen, texto, SISTEMA, 900);
    return json({ ok: Boolean(r.texto), motor: r.motor, ms: Date.now() - inicio, nivel: leerCalificacion(r.texto), texto: r.texto });
  } catch (err) {
    return json({ ok: false, ms: Date.now() - inicio, error: err?.message || String(err) });
  }
}

// ---------- utilidades ----------

function json(datos, estado = 200, extra = {}) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}
