/**
 * Herramientas compartidas por las guardias de convención que leen SQL del fuente.
 *
 * **Por qué viven acá y no en el test que las estrenó.** El reconocedor del filtro por clave
 * primaria nació dentro de `test/db/consultas.test.ts` para decidir a qué sentencia se le exige el
 * `ORDER BY`, y `test/db/ventas.test.ts` necesita **el mismo** reconocedor para exigir lo contrario:
 * que toda sentencia que opera sobre una fila concreta de `libros` filtre por igualdad exacta. Dos
 * copias del mismo lookbehind divergen sin que nada se ponga rojo, y la copia que quedara más laxa
 * sería justo la que deja de exigir.
 *
 * **Dónde están sus meta-guardias.** En `test/convenciones/sql.test.ts`, que es un test de
 * convenciones y no de un módulo: este archivo es infraestructura de las guardias de `consultas.ts`
 * y de `ventas.ts` —y de `edicion.ts` en el Block 5—, así que sus aserciones no pueden vivir dentro
 * del `describe` de uno de esos módulos. Vivían en `consultas.test.ts`, y ahí quedaban a merced de
 * que alguien reescribiera un describe que habla de otro módulo: con ese describe borrado, el
 * reconocedor se quedaba sin una sola aserción y la guardia de `ventas.ts` pasaba a apoyarse en un
 * lookbehind que nadie prueba.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * El fuente de un módulo del proyecto, leído **una sola vez** por ruta relativa.
 *
 * La memoización no es por velocidad: `test/db/ventas.test.ts` leía su propio fuente dos veces, en
 * dos `describe` distintos, y extraía las sentencias con dos expresiones hermanas —una con el nombre
 * de la constante y otra sin él— con una meta-guardia del extractor repetida literal en los dos.
 * Dos lecturas del mismo archivo son dos extractores que pueden divergir, y el que quedara más laxo
 * sería el que deja de mirar una sentencia.
 */
const fuentes = new Map<string, string>();

export function fuenteDeModulo(relativo: string): string {
  const leido =
    fuentes.get(relativo) ?? fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');

  fuentes.set(relativo, leido);

  return leido;
}

/**
 * El fuente con los comentarios y el **contenido** de las cadenas reemplazados por espacios.
 *
 * Conserva el largo carácter por carácter —espacio por espacio, salto de línea por salto de
 * línea—, así que los índices siguen valiendo sobre el original y el emparejado de llaves y
 * paréntesis que hace la guardia de M4 no se puede confundir con un `(` que viva dentro de una
 * sentencia SQL o de un comentario. Sin esto, el `INSERT INTO ventas (libro_id, …)` de una
 * constante desbalancearía el recorrido y la guardia mediría un cuerpo que no existe.
 *
 * **Por qué vive acá y no dentro del describe de M4 que lo estrenó.** Es el mismo despeje que
 * necesita toda guardia que lea código en vez de SQL: la que deriva los registros obligatorios de
 * `test/convenciones/sql.test.ts` contaba un `guardiaDeConvencionesDeSql({ … })` **comentado** como
 * un registro válido, así que comentar una línea apagaba cinco aserciones sin un solo rojo (medido:
 * 313/313 en verde). Dos copias del mismo despeje divergen, y la que quedara más laxa sería la que
 * deja de ver.
 *
 * **La expresión regular es un delimitador más, y acá no es un lujo.** Este despeje se estrenó
 * sobre módulos de `lib/db/`, donde no hay literales de expresión regular; en cuanto pasó a leer el
 * fuente de una **suite**, `const LITERAL = /'([^']*)'/gu` abrió una cadena falsa con la comilla de
 * adentro, blanqueó todo lo que seguía y los cinco registros escritos al final de
 * `test/convenciones/sql.test.ts` desaparecieron. Eso es la guardia poniéndose roja contra un árbol
 * correcto, que es el rojo que termina con la guardia borrada. Se distingue de una división por el
 * carácter significativo anterior —tras un identificador, un número, un `)` o un `]` hay división;
 * en cualquier otra posición, una expresión regular—, que es la regla que usa cualquier lexer de
 * JavaScript.
 *
 * Límite conocido: `/*` se lee siempre como comentario de bloque, así que un literal de expresión
 * regular escrito `/\*​/` no se reconoce. No existe hoy en el repositorio, y la dirección del error
 * es la que se ve —el despeje se comería el resto del archivo y la guardia se pondría roja— y no la
 * que calla.
 */
export function despejar(fuente: string): string {
  let resultado = '';
  let delimitador: string | null = null;
  let indice = 0;
  /** El último carácter significativo emitido: lo que distingue `/` de división de `/` de regex. */
  let previo = '';
  /** Dentro de una clase `[…]` de una expresión regular, donde el `/` no la cierra. */
  let enClase = false;

  const blanco = (caracter: string): string => (caracter === '\n' ? '\n' : ' ');
  const divide = (caracter: string): boolean => /[\w$)\]]/u.test(caracter);

  while (indice < fuente.length) {
    const actual = fuente[indice];
    const siguiente = fuente[indice + 1] ?? '';

    if (delimitador === '/') {
      if (actual === '\\') {
        resultado += `${blanco(actual)}${blanco(siguiente)}`;
        indice += 2;
        continue;
      }

      if (actual === '[') {
        enClase = true;
      } else if (actual === ']') {
        enClase = false;
      } else if (actual === '/' && !enClase) {
        delimitador = null;
        previo = actual;
        resultado += actual;
        indice += 1;
        continue;
      }

      resultado += blanco(actual);
      indice += 1;
      continue;
    }

    if (delimitador !== null) {
      if (actual === '\\') {
        resultado += `${blanco(actual)}${blanco(siguiente)}`;
        indice += 2;
        continue;
      }

      if (actual === delimitador) {
        delimitador = null;
        resultado += actual;
      } else {
        resultado += blanco(actual);
      }

      indice += 1;
      continue;
    }

    if (actual === '/' && siguiente === '/') {
      while (indice < fuente.length && fuente[indice] !== '\n') {
        resultado += ' ';
        indice += 1;
      }
      continue;
    }

    if (actual === '/' && siguiente === '*') {
      while (indice < fuente.length && !(fuente[indice] === '*' && fuente[indice + 1] === '/')) {
        resultado += blanco(fuente[indice]);
        indice += 1;
      }
      resultado += '  '.slice(0, Math.min(2, fuente.length - indice));
      indice += 2;
      continue;
    }

    if (actual === "'" || actual === '"' || actual === '`') {
      delimitador = actual;
    } else if (actual === '/' && !divide(previo)) {
      delimitador = '/';
      enClase = false;
    }

    if (/\S/u.test(actual)) {
      previo = actual;
    }

    resultado += actual;
    indice += 1;
  }

  return resultado;
}

/** Una sentencia declarada como constante de módulo, **con su nombre**, para que el rojo diga cuál. */
export interface DeclaracionSql {
  nombre: string;
  sentencia: string;
}

/**
 * El nombre de una constante de sentencia, **con los dígitos adentro**.
 *
 * `SQL_[A-Z_]+` dejaba invisibles a `SQL_001_INICIAL` y a `SQL_002_VENTAS`, que existen hoy en
 * `lib/db/migraciones/`: los dos extractores usaban el mismo patrón ciego, así que la cuenta
 * esperada y la extraída daban las dos cero y la meta-guardia del extractor pasaba en verde sobre un
 * módulo del que no se había mirado una sola sentencia. Con la lista de módulos que declaran SQL
 * derivada de esta misma cuenta, el patrón ciego además hacía que el registro obligatorio de
 * guardias no alcanzara nunca a las migraciones.
 */
const NOMBRE_DE_SENTENCIA = String.raw`SQL_[A-Z0-9_]+`;

/**
 * Un `db.prepare(` que **no** recibe una constante de sentencia declarada.
 *
 * Vive acá, y no escrito en cada guardia, por el mismo motivo que el resto de este archivo: estaba
 * copiado en `test/ayudas/guardias-sql.ts` y en `test/db/consultas.test.ts`, y una de las dos copias
 * se quedó en `SQL_[A-Z_]+`. La copia ciega al dígito daba por «armada al vuelo» a
 * `db.prepare(SQL_2_ORDENAR)` —o, según de qué lado se mire, dejaba pasar sin mirar a toda sentencia
 * con un dígito en el nombre—, y como el extractor de ese mismo archivo era igual de ciego, su
 * meta-guardia comparaba `0 === 0` y no avisaba de nada.
 *
 * El `\s*` va **dentro** del lookahead y no antes: afuera, el motor lo hace retroceder a cero
 * caracteres y entonces la mirada cae sobre el espacio, que no empieza con `SQL_`, así que la
 * negación se satisface y `db.prepare( SQL_LIBRO_POR_ID )` —escrito con espacios— se reportaba como
 * SQL armado al vuelo. Esa dirección del error es la que se ve —pone roja una sentencia correcta— y
 * no la que calla, pero el patrón dice lo que quiere decir sólo así.
 */
export const PREPARA_SIN_CONSTANTE = new RegExp(
  String.raw`db\.prepare\((?!\s*${NOMBRE_DE_SENTENCIA}\s*\))`,
  'u',
);

/**
 * Las sentencias que el módulo declara como constantes, con su nombre.
 *
 * Reconoce sólo las escritas como template literal, que es la forma que la guardia de M9 exige. Lo
 * que evita que eso sea un agujero es la meta-guardia del extractor —«extrae todas las sentencias del
 * archivo»— que compara esta cuenta contra la de declaraciones `SQL_` del fuente: una declarada con
 * comillas simples o con `String.raw` no queda afuera **en silencio**.
 */
export function declaracionesSql(relativo: string): DeclaracionSql[] {
  return Array.from(
    fuenteDeModulo(relativo).matchAll(
      new RegExp(String.raw`const (${NOMBRE_DE_SENTENCIA}) = \x60([\s\S]*?)\x60`, 'gu'),
    ),
    (encontrado) => ({ nombre: encontrado[1], sentencia: encontrado[2] }),
  );
}

/** Cuántas constantes `SQL_` declara el módulo, contadas sin mirar cómo se escribió cada una. */
export function declaracionesEsperadas(relativo: string): number {
  return (
    fuenteDeModulo(relativo).match(new RegExp(String.raw`const ${NOMBRE_DE_SENTENCIA}`, 'gu')) ?? []
  ).length;
}

/**
 * ¿El módulo declara SQL, y por lo tanto le corresponde una guardia registrada?
 *
 * Son **dos** formas y no una: declarar una constante `SQL_…`, o preparar una sentencia. La segunda
 * no es redundante —`db.prepare('UPDATE libros …')` sin constante no declara ninguna— y es
 * justamente la que hace que la exigencia de la constante, que vive dentro de
 * `guardiaDeConvencionesDeSql()`, alcance a un módulo que hoy no existe.
 *
 * **Lo que queda afuera, escrito para que nadie le suponga más:** el control de transacción y el
 * `PRAGMA` que `lib/db/migrar.ts` ejecuta con `db.exec()` —desvío D04, declarado en
 * `test/convenciones/barrido-de-mutaciones.md` y documentado en el propio código—, y el `db.exec()`
 * cuyo argumento no es un literal, como el `db.exec(migracion.sql)` del mismo runner: ahí el SQL lo
 * declara la migración, que sí entra por su constante.
 */
export function declaraSql(relativo: string): boolean {
  return declaraSqlEnFuente(fuenteDeModulo(relativo));
}

/**
 * El SQL que **escribe filas** ejecutado directamente con `.exec()`, sin constante y sin `prepare`.
 *
 * Es la tercera forma de declarar SQL, y la que faltaba: un `lib/db/purga.ts` con
 * `db.exec("UPDATE libros SET stock = 0 WHERE id >= 1")` quedaba fuera del universo del registro
 * obligatorio y ninguna guardia de M9 lo alcanzaba, con la suite entera en verde (medido: 319/319).
 * El docstring anterior lo daba por una exclusión de `lib/db/migrar.ts`, pero no es la exclusión de
 * un archivo: es la de una **forma**, y cualquier módulo nuevo podía escribirla.
 *
 * Se pide la palabra clave de DML dentro de un literal para no arrastrar al runner de migraciones,
 * cuyo `PRAGMA` y cuyo control de transacción son el desvío D04 —código de FEAT-001a, con sus
 * propias guardias— y cuyo `db.exec(migracion.sql)` ejecuta SQL que la migración sí declara como
 * constante. `CREATE`/`DROP` quedan afuera por lo mismo: el DDL del esquema vive en las migraciones,
 * que entran por su constante.
 */
const EJECUTA_DML = /\.exec\(\s*[`'"][^`'"]*\b(?:UPDATE|INSERT|DELETE)\b/iu;

/** La misma pregunta sobre un fuente, para poder fijar el reconocedor contra literales. */
export function declaraSqlEnFuente(fuente: string): boolean {
  return (
    (fuente.match(new RegExp(String.raw`const ${NOMBRE_DE_SENTENCIA}`, 'gu')) ?? []).length > 0 ||
    /\.prepare\(/u.test(fuente) ||
    EJECUTA_DML.test(fuente)
  );
}

/**
 * Todo módulo `.ts` bajo `lib/db/`, recursivo, en ruta relativa a la raíz.
 *
 * Vive acá y no copiado en cada guardia: era el mismo recorrido escrito tres veces —en
 * `test/convenciones/sql.test.ts`, en el describe de M4 de `test/db/ventas.test.ts` y en la guardia
 * de `server-only` de `test/db/migrar.test.ts`—, y tres copias de un recorrido son tres lugares
 * donde uno de ellos deja de ver un directorio. Las dos primeras ya salen de acá; la de
 * `migrar.test.ts` es de FEAT-001a y queda anotada como pendiente, no tocada por esta ronda.
 */
export function modulosDeDb(directorio = path.join(process.cwd(), 'lib/db')): string[] {
  return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const completo = path.join(directorio, entrada.name);

    if (entrada.isDirectory()) {
      return modulosDeDb(completo);
    }

    return /\.ts$/u.test(entrada.name) ? [path.relative(process.cwd(), completo)] : [];
  });
}

/**
 * La ruta con `/` como separador, para poder comparar una ruta del sistema de archivos con una
 * escrita a mano en el fuente de un test.
 */
export function conBarras(ruta: string): string {
  return ruta.split(path.sep).join('/');
}

/**
 * El patrón del filtro por clave primaria: la sentencia compara `id` con un parámetro posicional.
 *
 * El lookbehind es el que distingue `id = ?` de `libro_id = ?` y de `l.id = ?`: sin él, una consulta
 * al historial por libro quedaría exceptuada del `ORDER BY` sin filtrar por clave primaria. El alias
 * califica **cerrado**: `l.id = ?` sí es un filtro por clave primaria y aun así se le exige el
 * `ORDER BY`, que es el lado seguro de equivocarse.
 */
const FILTRA_POR_CLAVE_PRIMARIA = /(?<![\w.])id\s*=\s*\?/u;

/**
 * La sentencia sin sus comentarios, en las **dos** formas que SQLite admite.
 *
 * Se despejan las dos, `--` y `/* … *\/`, porque las dos son válidas y despejar sólo una deja el
 * bypass abierto por la otra. Es el mismo tratamiento —y por la misma razón— que
 * `sinComentarios()` de `test/convenciones/red.test.ts` le da al fuente de `next.config.ts`.
 *
 * El comentario de bloque cierra con `*\/` **o con el fin de la entrada**: SQLite comenta hasta el
 * final cuando el `*\/` falta, así que un `/* id = ?` sin cerrar es comentario para el motor. Sin
 * esa alternativa, el patrón no matcheaba nada y la cadena de adentro seguía contando como filtro
 * por clave primaria: era la cuarta forma del mismo bypass, con la guardia entera pasando en
 * verde sobre una sentencia sin `ORDER BY` y sin filtro. Lo fijan las dos aserciones del
 * comentario sin cerrar en el meta-guardia del patrón.
 *
 * El `[\s\S]*?` es **perezoso** a propósito: con un cuantificador voraz, dos comentarios de
 * bloque en la misma sentencia se comerían todo el SQL que hubiera entre ellos —incluido un
 * `id = ?` legítimo—, y la guardia pasaría a exigir de más. Lo fija la última aserción del
 * meta-guardia del patrón.
 */
export function sinComentarios(sentencia: string): string {
  return sentencia.replace(/\/\*[\s\S]*?(?:\*\/|$)/gu, ' ').replace(/--[^\n]*/gu, ' ');
}

/**
 * La sentencia sin sus comentarios **ni sus literales de texto**, que es sobre lo que se deciden las
 * reglas que hablan del identificador.
 *
 * Sin esto, la cadena `id = ?` escrita dentro de un literal (`WHERE titulo = 'id = ?'`) o de un
 * comentario exceptuaba a la sentencia del `ORDER BY` sin que filtrara por nada. Es la dirección
 * peligrosa del error: la guardia **deja de exigir**, en vez de exigir de más.
 *
 * El despeje de literales va **sólo acá** y no en las reglas no acotadas: `estado = 'activo'`
 * **es** un literal de texto, así que vaciarlo dejaría a esa regla exigiendo `estado = ''` y roja
 * contra el código correcto. Son tres cosas las que se despejan entre las dos funciones —el
 * comentario de línea, el de bloque y el literal—, y cada regla usa la que le corresponde.
 */
export function sinComentariosNiLiterales(sentencia: string): string {
  return sinComentarios(sentencia).replace(/'[^']*'/gu, "''");
}

/**
 * ¿La sentencia filtra por la clave primaria?
 *
 * El particionado de la guardia es **sintáctico y mecánico** —la sentencia compara `id` con un
 * parámetro posicional, o no lo hace— y nunca una lista de nombres exceptuados a mano: una
 * lista de nombres es un opt-out, y el primer `SQL_` que alguien agregue ahí se lleva puesta la
 * regla sin que nada se ponga rojo (M5, riesgo R6).
 */
export function filtraPorClavePrimaria(sentencia: string): boolean {
  return FILTRA_POR_CLAVE_PRIMARIA.test(sinComentariosNiLiterales(sentencia));
}

/**
 * El nombre de una tabla, en **todas** las formas en que SQLite admite escribirlo.
 *
 * Las cinco están verificadas contra el motor, no supuestas: el esquema calificado (`main.libros`,
 * con o sin espacios alrededor del punto) y el identificador citado con comillas dobles, con
 * corchetes, con acentos graves o con comillas simples son SQL válido y operan sobre la misma tabla.
 * Un reconocedor que sólo viera el nombre pelado falla **abierto** para las cuatro variantes
 * restantes: se le agregó a `lib/db/ventas.ts` una tercera sentencia
 * `UPDATE main.libros SET stock = ? WHERE id >= ?`, ejecutada de verdad dentro de la transacción, y
 * la suite quedó entera en verde.
 *
 * La forma con comillas simples no se puede reconocer acá, porque los literales de texto se vacían
 * antes de aplicar el patrón —y con razón: `estado = 'activo'` es un literal—. La desenmascara
 * `sinLiteralesEnPosicionDeTabla()`, que actúa antes del vaciado y sólo en posición de tabla.
 */
const TABLA = String.raw`(?:(?:main|temp)\s*\.\s*)?(?:"NOMBRE"|\[NOMBRE\]|\x60NOMBRE\x60|\bNOMBRE\b)`;

/**
 * Las palabras clave que ponen a una tabla como sujeto de una lectura o de una escritura.
 *
 * `UPDATE` admite entre medio la cláusula de resolución de conflictos (`UPDATE OR ROLLBACK libros`),
 * que es otra forma válida —y otra vez ignorada por el patrón anterior— de escribir la misma tabla.
 * `INTO` cubre `INSERT INTO`, `INSERT OR IGNORE INTO` y `REPLACE INTO`.
 */
const SUJETO = String.raw`\b(?:FROM|UPDATE(?:\s+OR\s+(?:ROLLBACK|ABORT|FAIL|IGNORE|REPLACE))?|JOIN|INTO)\s+`;

const OPERA_SOBRE_LIBROS = new RegExp(SUJETO + TABLA.replace(/NOMBRE/gu, 'libros'), 'iu');

/**
 * El identificador escrito como literal de texto **en posición de tabla**, devuelto a su forma pelada.
 *
 * SQLite acepta `UPDATE 'libros' SET …` —una comilla simple donde va un identificador— así que la
 * forma existe y hay que verla. Se desenmascara sólo cuando sigue inmediatamente a la palabra clave
 * que introduce la tabla: así `WHERE titulo = 'FROM libros'`, donde la palabra vive **adentro** del
 * literal, sigue sin contar, que es la dirección en la que un reconocedor de más pone roja una
 * sentencia correcta.
 */
const TABLA_ENTRE_COMILLAS_SIMPLES =
  /(\b(?:FROM|UPDATE(?:\s+OR\s+\w+)?|JOIN|INTO)\s+)'((?:main|temp)\s*\.\s*)?(\w+)'/giu;

function sinLiteralesEnPosicionDeTabla(sentencia: string): string {
  return sentencia.replace(TABLA_ENTRE_COMILLAS_SIMPLES, '$1$2$3');
}

/**
 * ¿La sentencia nombra la tabla `libros` como sujeto de una lectura o de una escritura?
 *
 * Sobre la sentencia despejada de comentarios y de literales, por lo mismo que el resto de las
 * reglas: la palabra escrita en prosa o dentro de una cadena no opera sobre ninguna fila. El orden
 * de los tres pasos importa —comentarios, después el identificador citado con comillas simples,
 * después el vaciado de literales— porque el desenmascarado necesita el literal todavía entero.
 *
 * `INTO` está en la lista aunque un `INSERT` no elija una fila existente: los módulos de operación
 * sobre un libro no insertan libros —los inserta el alta, en `lib/db/libros.ts`— así que si
 * apareciera un `INSERT INTO libros` en uno de ellos, la guardia se pone roja y alguien lo revisa.
 * Falla cerrado, como la guardia del `.immediate()`.
 */
export function tocaLaTablaLibros(sentencia: string): boolean {
  return OPERA_SOBRE_LIBROS.test(
    sinComentariosNiLiterales(sinLiteralesEnPosicionDeTabla(sinComentarios(sentencia))),
  );
}

/**
 * Los nombres con los que SQLite deja escribir la clave primaria de una tabla con `INTEGER PRIMARY
 * KEY`: el nombre de la columna y sus **tres** alias del rowid.
 *
 * Son tres y no una familia abierta —`rowid`, `_rowid_` y `oid`, los que documenta el motor— así que
 * enumerarlos cierra el conjunto en vez de empezar una persecución. Sin ellos, un
 * `WHERE rowid >= ?` elige la fila del libro de al lado y se cuela **incluso en un módulo
 * registrado**: `filtraPorClavePrimaria()` lo caza sólo donde esa guardia está registrada, y el
 * barrido universal de `lib/db/`, que es el que alcanza a todos, sólo mira este patrón.
 *
 * `_rowid_` va antes que `rowid` en la alternancia porque la primera alternativa que matchea gana;
 * al revés, el lookbehind de `COMPARA_POR_RANGO` rechazaría el `rowid` interno y la forma quedaría
 * sin reconocer.
 */
const ALIAS_DE_LA_CLAVE = String.raw`(?:_rowid_|rowid|oid|id)`;

/**
 * La clave primaria como la escribe SQL: pelada, citada en sus cuatro formas, y con calificador
 * opcional (`libros.id`, `l."id"`).
 *
 * El calificador **se admite** acá, al contrario que en `FILTRA_POR_CLAVE_PRIMARIA`, y la asimetría
 * es deliberada: allá el reconocedor decide una **excepción** —a qué sentencia se le perdona el
 * `ORDER BY`— y equivocarse de menos exige de más, que es el lado seguro; acá decide una
 * **prohibición**, así que ignorar `libros.id >= ?` sería dejar de prohibir.
 */
const COLUMNA_ID =
  String.raw`(?:(?:\w+|"\w+"|\[\w+\]|\x60\w+\x60)\s*\.\s*)?` +
  String.raw`(?:${ALIAS_DE_LA_CLAVE}|"${ALIAS_DE_LA_CLAVE}"|\[${ALIAS_DE_LA_CLAVE}\]|\x60${ALIAS_DE_LA_CLAVE}\x60)`;

/**
 * ¿Compara el identificador con algo que no es la igualdad?
 *
 * Es el complemento de `filtraPorClavePrimaria()` y no un duplicado suyo: exigir la igualdad no
 * alcanza, porque `WHERE id = ? OR id > ?` la contiene. El lookbehind es el que distingue `id` de
 * `libro_id` —el `_` es un carácter de palabra, así que la columna del historial no entra— y el
 * despeje es el mismo, para que un rango escrito en un comentario no ponga roja una sentencia
 * correcta.
 */
const COMPARA_POR_RANGO = new RegExp(
  String.raw`(?<![\w.])${COLUMNA_ID}\s*(?:>=|<=|<>|!=|>|<|\bBETWEEN\b|\bIN\b|\bLIKE\b)`,
  'iu',
);

export function comparaElIdPorRango(sentencia: string): boolean {
  return COMPARA_POR_RANGO.test(sinComentariosNiLiterales(sentencia));
}
