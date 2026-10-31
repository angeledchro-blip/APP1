// Pruebas del Worker con una base D1 simulada sobre node:sqlite y una IA falsa.
// Correr con: node --test test/worker.test.mjs   (desde la carpeta web/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

// D1 mínimo: prepare().bind().first()/all()/run() y batch()
function d1Falso() {
  const db = new DatabaseSync(':memory:');
  const preparar = (sql, args = []) => ({
    bind: (...a) => preparar(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
    _ejecutar: () => db.prepare(sql).run(...args),
  });
  return {
    prepare: (sql) => preparar(sql),
    batch: async (sts) => {
      db.exec('BEGIN');
      try {
        for (const s of sts) s._ejecutar();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    _db: db,
  };
}

const IMAGEN = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==';

async function nuevoWorker() {
  // Cada prueba usa una copia fresca del módulo (el estado de "base lista" vive en el módulo)
  const mod = await import(`../src/index.js?v=${Math.random()}`);
  return mod.default;
}

function pedir(worker, env, ruta, cuerpo) {
  const init = cuerpo ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) } : {};
  return worker.fetch(new Request('https://practica.test' + ruta, init), env, {});
}

test('crea las tablas, siembra el contenido y lo entrega', async () => {
  const w = await nuevoWorker();
  const env = { DB: d1Falso(), CF_VERSION_METADATA: { id: 'v1' } };
  const r = await pedir(w, env, '/api/contenido');
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.build, 'v1');
  assert.equal(d.ia, 'workers-ai');
  assert.ok(d.contenido.acordes.length >= 10);
  assert.ok(d.contenido.rutinas.length >= 5);
  assert.ok(d.contenido.lecciones.length >= 5);
  assert.ok(d.contenido.ejercicios.length >= 10);
  assert.ok(d.contenido.mensajes.guitarra.length > 0);
  assert.ok(d.contenido.mensajes.dibujo.length > 0);
});

test('un cambio en la base se ve en el contenido (tiempo real)', async () => {
  const w = await nuevoWorker();
  const env = { DB: d1Falso() };
  await pedir(w, env, '/api/contenido');
  env.DB._db.prepare("UPDATE config SET valor = 'Hoy: puro cambio G ↔ C' WHERE clave = 'mensaje_guitarra'").run();
  env.DB._db.prepare("UPDATE acordes SET activo = 0 WHERE id = 'Bm'").run();
  const d = await (await pedir(w, env, '/api/contenido')).json();
  assert.equal(d.contenido.mensajes.guitarra, 'Hoy: puro cambio G ↔ C');
  assert.ok(!d.contenido.acordes.some((a) => a.id === 'Bm'));
});

test('revisa un dibujo con la IA de Cloudflare y guarda la revisión', async () => {
  const w = await nuevoWorker();
  let recibido = null;
  const env = {
    DB: d1Falso(),
    AI: {
      run: async (modelo, entrada) => {
        recibido = { modelo, entrada };
        return { response: '**Lo que va bien**\n- Líneas seguras\n\n**Nivel en este ejercicio:** 3/5' };
      },
    },
  };
  const r = await pedir(w, env, '/api/dibujo/revisar', { imagen: IMAGEN, ejercicio: 'lineas-hombro', nota: '¿Van rectas?' });
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.match(d.comentario, /Lo que va bien/);
  assert.equal(recibido.modelo, '@cf/meta/llama-4-scout-17b-16e-instruct');
  const usuario = recibido.entrada.messages[1].content;
  assert.ok(usuario.some((p) => p.type === 'image_url' && p.image_url.url.startsWith('data:image/jpeg;base64,')));
  assert.ok(usuario.some((p) => p.type === 'text' && p.text.includes('Líneas rectas desde el hombro') && p.text.includes('¿Van rectas?')));
  const fila = env.DB._db.prepare('SELECT * FROM revisiones').get();
  assert.equal(fila.ejercicio_id, 'lineas-hombro');

  // La segunda revisión del mismo ejercicio incluye la anterior para comparar
  await pedir(w, env, '/api/dibujo/revisar', { imagen: IMAGEN, ejercicio: 'lineas-hombro' });
  const texto = recibido.entrada.messages[1].content.find((p) => p.type === 'text').text;
  assert.match(texto, /revisiones anteriores/);
});

test('con ANTHROPIC_API_KEY usa Claude con el formato correcto', async (t) => {
  const w = await nuevoWorker();
  const llamadas = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    llamadas.push({ url, init, cuerpo: JSON.parse(init.body) });
    if (llamadas.length === 1) return new Response('{"error":{"message":"effort not supported"}}', { status: 400 });
    return Response.json({ content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: '**Qué corregir**\n- Algo' }] });
  };
  t.after(() => (globalThis.fetch = fetchOriginal));
  const env = { DB: d1Falso(), ANTHROPIC_API_KEY: 'sk-prueba' };
  const r = await pedir(w, env, '/api/dibujo/revisar', { imagen: IMAGEN, ejercicio: 'elipses' });
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.equal(d.motor, 'claude-sonnet-5-5');
  assert.equal(d.comentario, '**Qué corregir**\n- Algo');
  const [primera, segunda] = llamadas;
  assert.equal(primera.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(primera.init.headers['x-api-key'], 'sk-prueba');
  assert.equal(primera.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(primera.cuerpo.output_config.effort, 'low');
  const img = primera.cuerpo.messages[0].content[0];
  assert.deepEqual(Object.keys(img.source).sort(), ['data', 'media_type', 'type']);
  assert.equal(img.source.media_type, 'image/jpeg');
  assert.equal(segunda.cuerpo.output_config, undefined, 'el reintento va sin output_config');
});

test('respeta el límite de revisiones por día', async () => {
  const w = await nuevoWorker();
  const env = { DB: d1Falso(), AI: { run: async () => ({ response: 'ok' }) } };
  await pedir(w, env, '/api/contenido');
  env.DB._db.prepare("UPDATE config SET valor = '1' WHERE clave = 'limite_revisiones_dia'").run();
  const r1 = await pedir(w, env, '/api/dibujo/revisar', { imagen: IMAGEN });
  assert.equal(r1.status, 200);
  const r2 = await pedir(w, env, '/api/dibujo/revisar', { imagen: IMAGEN });
  assert.equal(r2.status, 429);
});

test('rechaza fotos inválidas', async () => {
  const w = await nuevoWorker();
  const env = { DB: d1Falso(), AI: { run: async () => ({ response: 'ok' }) } };
  const r = await pedir(w, env, '/api/dibujo/revisar', { imagen: 'data:text/html;base64,PGgxPg==' });
  assert.equal(r.status, 400);
});

test('al subir SEED_VERSION no pisa el mensaje editado en vivo', async () => {
  const w = await nuevoWorker();
  const env = { DB: d1Falso() };
  await pedir(w, env, '/api/contenido');
  env.DB._db.prepare("UPDATE config SET valor = 'editado' WHERE clave = 'mensaje_dibujo'").run();
  env.DB._db.prepare("UPDATE config SET valor = '0' WHERE clave = 'seed_version'").run();
  const w2 = await nuevoWorker();
  const d = await (await pedir(w2, env, '/api/contenido')).json();
  assert.equal(d.contenido.mensajes.dibujo, 'editado');
});

test('cámara en vivo: da un consejo corto, no repite y respeta el límite', async () => {
  const w = await nuevoWorker();
  let recibido = null;
  const env = {
    DB: d1Falso(),
    AI: {
      run: async (modelo, entrada) => {
        recibido = entrada;
        return { response: 'Suelta la muñeca y traza desde el hombro.' };
      },
    },
  };
  const c = await (await pedir(w, env, '/api/contenido')).json();
  assert.equal(c.contenido.intervaloVivo, 20);
  const r = await pedir(w, env, '/api/dibujo/vivo', { imagen: IMAGEN, ejercicio: 'lineas-hombro', previos: ['Consejo viejo'] });
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.equal(d.consejo, 'Suelta la muñeca y traza desde el hombro.');
  assert.equal(recibido.max_tokens, 160);
  assert.match(recibido.messages[0].content, /EN VIVO/);
  const texto = recibido.messages[1].content.find((p) => p.type === 'text').text;
  assert.match(texto, /Consejo viejo/);
  assert.match(texto, /Líneas rectas desde el hombro/);
  env.DB._db.prepare("UPDATE config SET valor = '1' WHERE clave = 'limite_vivo_dia'").run();
  const r2 = await pedir(w, env, '/api/dibujo/vivo', { imagen: IMAGEN });
  assert.equal(r2.status, 429);
});
