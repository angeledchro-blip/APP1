// Contenido inicial de la base de datos (D1).
// Para cambiar contenido hay dos caminos:
//   1) Editar las tablas de D1 directo (se ve en la app en menos de 30 s).
//   2) Editar este archivo y subir SEED_VERSION: al siguiente deploy se actualizan las filas con el mismo id.
// Las filas que se agregan directo en D1 no se borran al resembrar.

export const SEED_VERSION = 4;

export const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS config (
     clave TEXT PRIMARY KEY,
     valor TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS acordes (
     id TEXT PRIMARY KEY,
     nombre TEXT NOT NULL,
     trastes TEXT NOT NULL,      -- de la 6ª a la 1ª cuerda, separados por coma; x = no se toca
     dedos TEXT NOT NULL,        -- dedo para cada cuerda (0 = al aire / sin dedo)
     cejilla INTEGER NOT NULL DEFAULT 0,
     nivel INTEGER NOT NULL DEFAULT 1,
     orden INTEGER NOT NULL DEFAULT 0,
     activo INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS rutinas (
     id TEXT PRIMARY KEY,
     titulo TEXT NOT NULL,
     descripcion TEXT NOT NULL DEFAULT '',
     secuencia TEXT NOT NULL,    -- ids de acordes separados por coma
     nivel INTEGER NOT NULL DEFAULT 1,
     orden INTEGER NOT NULL DEFAULT 0,
     activo INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS lecciones (
     id TEXT PRIMARY KEY,
     titulo TEXT NOT NULL,
     descripcion TEXT NOT NULL DEFAULT '',
     notas TEXT NOT NULL,        -- pares cuerda:traste separados por coma, ej. 6:0,6:1
     orden INTEGER NOT NULL DEFAULT 0,
     activo INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS ejercicios (
     id TEXT PRIMARY KEY,
     titulo TEXT NOT NULL,
     objetivo TEXT NOT NULL,
     instrucciones TEXT NOT NULL,
     criterios TEXT NOT NULL,
     minutos INTEGER NOT NULL DEFAULT 10,
     nivel INTEGER NOT NULL DEFAULT 1,
     orden INTEGER NOT NULL DEFAULT 0,
     activo INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS revisiones (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ejercicio_id TEXT,
     fecha TEXT NOT NULL,
     motor TEXT NOT NULL,
     nota TEXT NOT NULL DEFAULT '',
     comentario TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_revisiones_fecha ON revisiones (fecha)`,
  `CREATE TABLE IF NOT EXISTS vivo_conteo (
     fecha TEXT PRIMARY KEY,
     n INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS niveles (
     id TEXT PRIMARY KEY,
     orden INTEGER NOT NULL,
     titulo TEXT NOT NULL,
     descripcion TEXT NOT NULL,
     acordes TEXT NOT NULL DEFAULT '',   -- acordes que se desbloquean en este nivel
     practica TEXT NOT NULL DEFAULT '',  -- qué practicar: rutina:<id> o acorde:<id>
     reto_tipo TEXT NOT NULL,            -- repite | cambios | ritmo
     reto_param TEXT NOT NULL DEFAULT '',
     reto_meta INTEGER NOT NULL DEFAULT 0,
     activo INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS progreso (
     clave TEXT PRIMARY KEY,
     valor TEXT NOT NULL,
     fecha TEXT NOT NULL
   )`,
];

// Valores de config. Al resembrar NO se pisan los que ya existen (para no borrar cambios hechos en vivo).
export const CONFIG = {
  // Mensaje de arriba en cada sección
  mensaje_guitarra:
    'Empieza en Camino: cada nivel te enseña acordes nuevos y los desbloqueas pasando su reto. Primero afina la guitarra.',
  mensaje_dibujo:
    'Ve en orden: cada ejercicio se aprueba con 3/5 o más en la revisión y desbloquea el siguiente. Dale Empezar sesión y te corrijo en vivo.',
  // Calificación mínima (de 5) para aprobar un ejercicio de dibujo
  aprobar_dibujo: '3',
  limite_revisiones_dia: '40',
  modelo_claude: 'claude-sonnet-5-5',
  modelo_workers_ai: '@cf/meta/llama-4-scout-17b-16e-instruct',
  // Cámara en vivo: cada cuántos segundos mira la hoja, modelo y límite diario
  intervalo_vivo_seg: '10',
  modelo_claude_vivo: 'claude-haiku-5-5',
  limite_vivo_dia: '400',
};

export const ACORDES = [
  // id, nombre, trastes (6ª→1ª), dedos, cejilla, nivel
  ['Em', 'Em', '0,2,2,0,0,0', '0,2,3,0,0,0', 0, 1],
  ['Am', 'Am', 'x,0,2,2,1,0', 'x,0,2,3,1,0', 0, 1],
  ['E', 'E', '0,2,2,1,0,0', '0,2,3,1,0,0', 0, 1],
  ['A', 'A', 'x,0,2,2,2,0', 'x,0,1,2,3,0', 0, 1],
  ['D', 'D', 'x,x,0,2,3,2', 'x,x,0,1,3,2', 0, 1],
  ['Dm', 'Dm', 'x,x,0,2,3,1', 'x,x,0,2,3,1', 0, 1],
  ['G', 'G', '3,2,0,0,0,3', '2,1,0,0,0,3', 0, 1],
  ['C', 'C', 'x,3,2,0,1,0', 'x,3,2,0,1,0', 0, 1],
  ['A7', 'A7', 'x,0,2,0,2,0', 'x,0,2,0,3,0', 0, 2],
  ['E7', 'E7', '0,2,0,1,0,0', '0,2,0,1,0,0', 0, 2],
  ['D7', 'D7', 'x,x,0,2,1,2', 'x,x,0,2,1,3', 0, 2],
  ['G7', 'G7', '3,2,0,0,0,1', '3,2,0,0,0,1', 0, 2],
  ['C7', 'C7', 'x,3,2,3,1,0', 'x,3,2,4,1,0', 0, 2],
  ['Fmaj7', 'Fmaj7', 'x,x,3,2,1,0', 'x,x,3,2,1,0', 0, 2],
  ['F', 'F', '1,3,3,2,1,1', '1,3,4,2,1,1', 1, 3],
  ['Bm', 'Bm', 'x,2,4,4,3,2', 'x,1,3,4,2,1', 2, 3],
];

export const RUTINAS = [
  ['em-am', 'Em ↔ Am', 'El cambio más fácil: solo mueves dos dedos una cuerda.', 'Em,Am,Em,Am,Em,Am,Em,Am', 1],
  ['e-a', 'E ↔ A', 'Cambio entre dos acordes mayores básicos.', 'E,A,E,A,E,A,E,A', 1],
  ['a-d', 'A ↔ D', 'Deja el dedo 3 cerca de la 2ª cuerda para cambiar más rápido.', 'A,D,A,D,A,D,A,D', 1],
  ['d-g', 'D ↔ G', 'Cambio clave para muchísimas canciones.', 'D,G,D,G,D,G,D,G', 1],
  ['g-c', 'G ↔ C', 'Mueve los dedos juntos, como una sola forma.', 'G,C,G,C,G,C,G,C', 1],
  ['g-d-em-c', 'G – D – Em – C', 'La progresión de cuatro acordes más usada en el pop.', 'G,D,Em,C,G,D,Em,C', 2],
  ['am-f-c-g', 'Am – Fmaj7 – C – G', 'Progresión en La menor con un Fa fácil (sin cejilla).', 'Am,Fmaj7,C,G,Am,Fmaj7,C,G', 2],
  ['ranchera-d', 'Ranchera en D', 'Base de muchas rancheras y norteñas: D, A7 y G.', 'D,A7,D,A7,G,D,A7,D', 2],
  ['blues-a', 'Blues en A', 'Los 12 compases del blues con acordes de séptima.', 'A7,A7,A7,A7,D7,D7,A7,A7,E7,D7,A7,E7', 2],
  ['cejillas', 'Primeras cejillas', 'Para cuando ya domines los abiertos: F y Bm.', 'C,F,C,F,G,Bm,G,Bm', 3],
];

export const LECCIONES = [
  ['al-aire', 'Cuerdas al aire', 'Toca cada cuerda sin pisar, de la 6ª (la más gruesa) a la 1ª y de regreso.', '6:0,5:0,4:0,3:0,2:0,1:0,1:0,2:0,3:0,4:0,5:0,6:0'],
  ['naturales-6', 'Notas de la 6ª cuerda', 'Mi, Fa, Sol y La en la cuerda más gruesa. Son las notas base de muchos acordes.', '6:0,6:1,6:3,6:5,6:3,6:1,6:0'],
  ['naturales-5', 'Notas de la 5ª cuerda', 'La, Si, Do y Re en la 5ª cuerda.', '5:0,5:2,5:3,5:5,5:3,5:2,5:0'],
  ['cromatico', 'Cromático 1-2-3-4', 'Un dedo por traste: índice en el 1, medio en el 2, anular en el 3 y meñique en el 4. Despacio y parejo.', '6:1,6:2,6:3,6:4,5:1,5:2,5:3,5:4,4:1,4:2,4:3,4:4'],
  ['do-mayor', 'Escala de Do mayor', 'Do, Re, Mi, Fa, Sol, La, Si, Do en primera posición, subiendo y bajando.', '5:3,4:0,4:2,4:3,3:0,3:2,2:0,2:1,2:0,3:2,3:0,4:3,4:2,4:0,5:3'],
  ['pentatonica-em', 'Pentatónica de Mi menor', 'La escala más usada para improvisar. Todo en trastes 0, 2 y 3.', '6:0,6:3,5:0,5:2,4:0,4:2,3:0,3:2,2:0,2:3,1:0,1:3'],
  ['himno-alegria', 'Himno a la alegría', 'La melodía de Beethoven, nota por nota.', '4:2,4:2,4:3,3:0,3:0,4:3,4:2,4:0,5:3,5:3,4:0,4:2,4:2,4:0,4:0'],
];

export const EJERCICIOS = [
  ['lineas-hombro', 'Líneas rectas desde el hombro',
    'Trazar líneas rectas y seguras, sin dudar.',
    'Marca dos puntos en la hoja. Haz 3 o 4 pasadas en el aire sobre la línea sin tocar el papel y luego trázala de un solo movimiento, moviendo el brazo desde el hombro (la muñeca queda fija). Llena una hoja con líneas de distintos largos y direcciones.',
    'Que las líneas sean rectas, que empiecen y terminen en los puntos, y que sean un solo trazo seguro (sin trazos peludos, temblorosos ni corregidos).',
    10, 1],
  ['lineas-encimadas', 'Líneas encimadas',
    'Controlar la dirección del trazo repitiéndolo encima del anterior.',
    'Traza una línea recta y luego repásala encima 4 o 5 veces, intentando pasar exactamente por el mismo lugar. Haz unas 20 en la hoja, en distintas direcciones.',
    'Qué tan juntas quedan las repasadas, sobre todo en las puntas, y que el trazo siga siendo rápido y seguro.',
    10, 1],
  ['elipses', 'Elipses y círculos',
    'Dibujar curvas lisas y simétricas.',
    'Llena una hoja con elipses de distintos tamaños, desde casi círculos hasta muy delgadas. Da 2 o 3 vueltas en cada una, moviendo el brazo desde el hombro.',
    'Que las elipses sean lisas y simétricas (sin picos ni partes planas) y que las vueltas queden juntas.',
    10, 1],
  ['contorno-ciego', 'Contorno a ciegas',
    'Entrenar la observación (no el parecido).',
    'Mira tu mano y dibuja su contorno durante 2 minutos SIN ver el papel, despacio, siguiendo cada arruga con la vista. Después haz otro viendo el papel solo de vez en cuando.',
    'Que la línea sea continua y que se note que observaste detalles. No se espera que se parezca.',
    10, 1],
  ['valores', 'Escala de valores',
    'Controlar qué tan claro u oscuro sombreas.',
    'Dibuja una fila de 5 cuadros. Deja el primero blanco y el último lo más oscuro que puedas; llena los de en medio con tonos intermedios usando achurado (líneas paralelas juntas). Luego repite la fila sombreando con la presión del lápiz.',
    'Que el cambio entre cuadros sea parejo, que no haya dos cuadros del mismo tono y que el achurado se vea uniforme.',
    15, 1],
  ['cajas-1-punto', 'Cajas en perspectiva de un punto',
    'Entender cómo las líneas se juntan en un punto de fuga.',
    'Traza una línea de horizonte con un punto de fuga en medio. Dibuja de 6 a 10 cajas: unas arriba, otras abajo y a los lados del horizonte. Las líneas de profundidad de todas las cajas van hacia el punto de fuga.',
    'Que las líneas de profundidad lleguen al punto de fuga, que las verticales sean verticales y las horizontales horizontales.',
    15, 2],
  ['cilindros', 'Cilindros',
    'Construir objetos redondos con elipses alineadas.',
    'Dibuja un eje (una línea recta) y una elipse en cada punta, atravesadas por el eje. Une las elipses con dos líneas. Haz cilindros parados, acostados e inclinados.',
    'Que las elipses estén alineadas al eje, que sean simétricas y que las paredes del cilindro sean rectas y toquen las elipses.',
    15, 2],
  ['esfera-luz', 'Esfera con luz y sombra',
    'Dar volumen con luz y sombra.',
    'Dibuja un círculo y decide de dónde viene la luz. Sombrea la esfera: parte iluminada, sombra propia, luz reflejada en la orilla de abajo y la sombra que proyecta en el piso.',
    'Que la luz venga de un solo lado de forma consistente, que el paso de claro a oscuro sea suave y que la sombra proyectada esté del lado contrario a la luz.',
    20, 2],
  ['cajas-2-puntos', 'Cajas en perspectiva de dos puntos',
    'Dibujar cajas vistas desde una esquina.',
    'Traza el horizonte y pon dos puntos de fuga muy separados (hasta las orillas de la hoja). Dibuja de 5 a 8 cajas; cada lado de la caja va a su punto de fuga.',
    'Que cada juego de líneas vaya a su punto de fuga, que las cajas no se vean deformadas y que las verticales sean paralelas.',
    20, 2],
  ['objeto-formas', 'Un objeto con formas básicas',
    'Dibujar algo real construyéndolo con cajas y cilindros.',
    'Pon una taza, un vaso o una botella frente a ti. Primero constrúyela con formas básicas (cilindros, cajas, elipses) con líneas suaves y luego remarca el contorno final.',
    'Las proporciones del objeto, que la construcción se note y que las elipses de arriba y abajo sean correctas.',
    20, 2],
  ['gesto', 'Gestos de figura humana',
    'Capturar el movimiento de una pose rápido.',
    'Busca fotos de personas en poses (deportes, baile). Haz dibujos de 30 a 60 segundos: primero una línea de acción que siga la curva del cuerpo y luego las formas principales encima.',
    'Que haya una línea de acción clara, que las poses se sientan con movimiento y que no se pierda tiempo en detalles.',
    15, 2],
  ['proporciones-cara', 'Proporciones de la cara',
    'Ubicar ojos, nariz y boca en su lugar.',
    'Dibuja un óvalo con una línea vertical al centro. Los ojos van a la mitad de la altura de la cabeza; la nariz a la mitad entre ojos y barbilla; la boca a un tercio entre nariz y barbilla.',
    'Que las proporciones estén bien ubicadas, que la cara sea simétrica y que se usen líneas guía.',
    20, 3],
];

// Camino de guitarra: cada nivel desbloquea acordes y se pasa con un reto.
// reto repite: tocar el acorde limpio N veces · cambios: N cambios en 1 minuto · ritmo: rutina a N BPM con 80% a tiempo
export const NIVELES = [
  ['n1', 'Tu primer acorde: Em',
    'Em es el acorde más fácil: solo dos dedos en el traste 2. Pon los dedos con la punta, rasguea las 6 cuerdas y revisa que todas suenen limpias.',
    'Em', 'acorde:Em', 'repite', 'Em', 5],
  ['n2', 'Am y tu primer cambio',
    'Am usa los mismos dedos 2 y 3 que Em, pero una cuerda más abajo, más el dedo 1 en el traste 1. Mueve los dos dedos juntos, como una sola pieza.',
    'Am', 'rutina:em-am', 'cambios', 'Em,Am', 10],
  ['n3', 'E: Em con un dedo más',
    'E es igual a Em, solo agrega el dedo 1 en la 3ª cuerda, traste 1. Practica pasar de E a Am: es la misma forma movida una cuerda.',
    'E', 'acorde:E', 'cambios', 'E,Am', 10],
  ['n4', 'A y D',
    'A: tres dedos juntitos en el traste 2. D: forma de triángulo en las 3 cuerdas más delgadas; no toques la 6ª ni la 5ª.',
    'A,D', 'rutina:a-d', 'cambios', 'A,D', 10],
  ['n5', 'G y C',
    'Los acordes más usados en canciones. Estiran más la mano: tómate tu tiempo y cuida que no se apaguen cuerdas.',
    'G,C', 'rutina:g-c', 'cambios', 'G,C', 8],
  ['n6', 'Tu primera progresión',
    'G, D, Em y C: con estos cuatro tocas cientos de canciones. Ahora con metrónomo, despacio.',
    '', 'rutina:g-d-em-c', 'ritmo', 'g-d-em-c', 60],
  ['n7', 'Dm y un Fa fácil',
    'Dm se parece a D. Fmaj7 es un Fa sin cejilla que suena bonito y te prepara para el Fa completo.',
    'Dm,Fmaj7', 'rutina:am-f-c-g', 'ritmo', 'am-f-c-g', 60],
  ['n8', 'Acordes de séptima',
    'A7, D7, E7, G7 y C7: los acordes de las rancheras y el blues.',
    'A7,D7,E7,G7,C7', 'rutina:ranchera-d', 'ritmo', 'ranchera-d', 70],
  ['n9', 'Blues en A',
    'Los 12 compases del blues con séptimas. Aquí ya se siente que tocas en serio.',
    '', 'rutina:blues-a', 'ritmo', 'blues-a', 70],
  ['n10', 'Cejillas: F y Bm',
    'El jefe final: el dedo 1 aplasta varias cuerdas a la vez. Es normal que tarde semanas en sonar limpio; no te desesperes.',
    'F,Bm', 'rutina:cejillas', 'cambios', 'C,F', 6],
];
