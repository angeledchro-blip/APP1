# Práctica

App para practicar **dibujo** (con la cámara) y **guitarra** (con el micrófono).

## Cómo está armada

```
android/   App Android: un cascarón que abre la web y le da permiso de cámara y micrófono.
web/       Web en Cloudflare (Worker): toda la app vive aquí.
  public/  La interfaz (HTML, CSS y JS): afinador, notas, acordes y dibujo.
  src/     API + base de datos D1 (contenido) + revisión de dibujos con IA.
  test/    Pruebas (detección de notas y acordes, y la API).
```

Como la app solo abre la web, **casi todo se cambia sin reinstalar el APK**:

| Qué cambia | Dónde | Cuándo se ve en la app |
| --- | --- | --- |
| Acordes, rutinas, lecciones de notas, ejercicios de dibujo, mensaje de arriba | Tablas de D1 (`acordes`, `rutinas`, `lecciones`, `ejercicios`, `config`) | En menos de 30 s |
| Diseño, funciones o arreglos de la app | `web/public` o `web/src` → push a `main` (Cloudflare lo publica solo) | Se recarga sola al terminar el deploy |
| Permisos, ícono o nombre de la app | `android/` → compilar en Bitrise | Hay que instalar el APK nuevo |

### Contenido (D1)

- La base se crea y se llena sola con `web/src/seed.js` la primera vez.
- Para cambiar contenido en vivo: editar las filas en D1 (`activo = 0` oculta una fila sin borrarla).
- Para cambiarlo desde el código: editar `seed.js` y subir `SEED_VERSION` (actualiza las filas con el mismo `id`; no pisa la config editada en vivo).
- `config.mensaje` es el aviso que sale arriba en la app.

### IA para revisar dibujos

- Sin configurar nada usa la IA gratis de Cloudflare (`config.modelo_workers_ai`).
- Para que revise **Claude**: en Cloudflare → Workers → `practica` → Settings → Variables and Secrets, agregar el secreto `ANTHROPIC_API_KEY`. El modelo se elige en `config.modelo_claude`.
- Límite de revisiones por día: `config.limite_revisiones_dia`.

## Compilar el APK

Bitrise, workflow `build_apk` (proyecto en `android/`). La dirección de la web está en
`android/gradle.properties` (`practica.webUrl`) o en la variable de entorno `PRACTICA_WEB_URL`.
El APK se firma siempre con `android/app/debug.keystore`, así que cada versión se instala encima de la anterior.

## Pruebas

```
cd web
npm install
npm test
```
