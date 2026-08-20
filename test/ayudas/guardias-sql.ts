import { describe, expect, it } from 'vitest';

import {
  comparaElIdPorRango,
  declaracionesEsperadas,
  declaracionesSql,
  filtraPorClavePrimaria,
  fuenteDeModulo,
  PREPARA_SIN_CONSTANTE,
  tocaLaTablaLibros,
} from './convenciones-sql';

/**
 * Las guardias de convención de un módulo del repositorio, **parametrizadas por módulo**.
 *
 * Las estrenó `test/db/ventas.test.ts` como dos `describe` escritos ahí adentro. `lib/db/edicion.ts`
 * —el Block 5— necesita las dos exactamente iguales: la de M9 (la barrera `server-only` y el SQL sin
 * interpolación) y la que exige que toda sentencia que opera sobre una fila de `libros` la elija por
 * su clave primaria con igualdad exacta. Copiar un describe de sesenta líneas al test del módulo
 * siguiente es cómo las dos copias divergen, y la que quedara más laxa sería la que deja de exigir:
 * de ahí que las guardias se registren desde acá con una línea por módulo.
 *
 * Se registran con `describe`/`it` de Vitest desde un archivo de `test/ayudas/`, que **no** entra en
 * el `include` de suites: nada se recolecta por existir este archivo. Lo que lo dispara es la llamada
 * desde el test del módulo.
 */

/** El módulo vigilado, en ruta relativa a la raíz del repo. */
export interface ModuloVigilado {
  relativo: string;
}

/**
 * Lo que se le exige a **todo** módulo que declara SQL, prepare sentencias o no.
 *
 * Se extrae para que los dos registradores de abajo compartan las mismas cuatro aserciones en vez de
 * tener cada uno su copia: dos copias divergen, y la que quedara más laxa sería la que deja de
 * exigir. Es el mismo argumento con el que estas guardias se parametrizaron por módulo.
 *
 * El fuente se lee **una sola vez** (`fuenteDeModulo()`) y las sentencias se extraen **una sola vez**
 * (`declaracionesSql()`), con su nombre.
 */
function guardiasDelSqlDeclarado(relativo: string): void {
  const fuente = fuenteDeModulo(relativo);
  const declaraciones = declaracionesSql(relativo);

  it('marca server-only antes que ningún otro import', () => {
    // La barrera de un módulo que abre la base. Es además de lo que la guardia derivada de
    // `test/db/migrar.test.ts` deduce qué módulos de `lib/db/` la abren, así que sacarla de acá
    // también saca al archivo de esa lista.
    expect(fuente.match(/^import .*$/mu)?.[0]).toBe("import 'server-only';");
  });

  it('extrae todas las sentencias del archivo, no sólo las escritas con backtick', () => {
    // Meta-guardia del extractor, y la única copia de esta aserción: una sentencia declarada con
    // comillas simples o con `String.raw` quedaría fuera de la lista y ninguna de las guardias de
    // abajo —ni las de identidad de fila— la mirarían **en silencio**.
    expect(declaraciones).toHaveLength(declaracionesEsperadas(relativo));
    expect(declaraciones.length).toBeGreaterThan(0);
  });

  it('declara cada sentencia como un único template literal, sin concatenar (M9)', () => {
    // Va sobre la **declaración** y no sobre el sitio de la llamada, igual que la guardia de las
    // migraciones: `const SQL_X = ` + COLUMNA + ` = ?`;` pasa un `prepare(SQL_X)` impecable con
    // una columna que vino de afuera. Se exige que el lado derecho arranque en backtick y que el
    // punto y coma vaya inmediatamente después del backtick que lo cierra.
    const patron = /const\s+(SQL_\w+)\s*=\s*/gu;
    let cuantas = 0;
    let encontrado = patron.exec(fuente);

    while (encontrado !== null) {
      const nombre = `${relativo} → ${encontrado[1]}`;
      const inicio = encontrado.index + encontrado[0].length;

      expect(fuente[inicio], `${nombre}: no arranca con un template literal`).toBe('`');

      const cierre = fuente.indexOf('`', inicio + 1);
      expect(cierre, `${nombre}: el template literal no cierra`).toBeGreaterThan(inicio);
      expect(
        fuente.slice(cierre + 1, cierre + 2),
        `${nombre}: sigue algo después del literal`,
      ).toBe(';');

      cuantas += 1;
      encontrado = patron.exec(fuente);
    }

    expect(cuantas).toBeGreaterThan(0);
    expect(cuantas).toBe(declaraciones.length);
  });

  it('no interpola ni concatena nada dentro de una sentencia SQL', () => {
    // El filtro por línea, con los comentarios afuera para que la prosa no dé falsos positivos.
    // No se busca un `+` a secas dentro del SQL: la aritmética legítima sería SQL válido; lo que
    // cierra ese hueco es la guardia estructural de la declaración, de arriba.
    const lineasSql = fuente
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => !linea.startsWith('//') && !linea.startsWith('*'))
      .filter((linea) =>
        /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|FROM|WHERE|VALUES|SET)\b/u.test(linea),
      );

    expect(lineasSql.length).toBeGreaterThan(0);
    for (const linea of lineasSql) {
      expect(linea).not.toMatch(/\$\{/u);
    }
  });
}

/**
 * Las convenciones de un módulo de `lib/db/` que declara SQL **y lo prepara** (M9).
 *
 * Es la barrera de un módulo que abre la base, más la prohibición de armar SQL por concatenación,
 * más la exigencia de que `prepare()` reciba siempre una constante declarada.
 */
export function guardiaDeConvencionesDeSql({ relativo }: ModuloVigilado): void {
  describe(`convenciones de ${relativo} (M9)`, () => {
    const fuente = fuenteDeModulo(relativo);
    const declaraciones = declaracionesSql(relativo);

    guardiasDelSqlDeclarado(relativo);

    it('sólo prepara sentencias declaradas como constante, nunca una armada al vuelo', () => {
      expect(fuente).toMatch(/db\.prepare\(/u);
      expect(fuente).not.toMatch(PREPARA_SIN_CONSTANTE);

      for (const { nombre, sentencia } of declaraciones) {
        expect(sentencia, `${relativo} → ${nombre}`).not.toMatch(/\$\{/u);
      }
    });
  });
}

/**
 * Las convenciones de un módulo de `lib/db/` que declara SQL y **no lo prepara**: hoy las dos
 * migraciones de DDL, cuyo texto ejecuta el runner con `db.exec()`.
 *
 * Existe para que el registro obligatorio de guardias —«todo módulo de `lib/db/` que declara SQL
 * está registrado», en `test/convenciones/sql.test.ts`— sea satisfacible por esos módulos sin
 * aflojarle a nadie el `prepare()`. **No es una puerta de escape**: exige que el módulo de verdad no
 * prepare nada, así que el día que uno de ellos estrene un `db.prepare()` esta guardia se pone roja
 * y hay que moverlo al registrador de arriba, que es el que exige la constante.
 */
export function guardiaDeSqlSinPreparar({ relativo }: ModuloVigilado): void {
  describe(`convenciones de ${relativo}, que declara SQL y no lo prepara (M9)`, () => {
    guardiasDelSqlDeclarado(relativo);

    it('no prepara ninguna sentencia: su SQL lo ejecuta el runner de migraciones', () => {
      expect(
        fuenteDeModulo(relativo),
        `${relativo} prepara sentencias: le corresponde guardiaDeConvencionesDeSql()`,
      ).not.toMatch(/\.prepare\(/u);
    });
  });
}

/** El módulo vigilado y las sentencias que se espera que operen sobre una fila de `libros`. */
export interface ModuloDeOperacionSobreUnLibro extends ModuloVigilado {
  /**
   * Los nombres de las sentencias que **hoy** operan sobre una fila de `libros`.
   *
   * No es una lista de exceptuadas —eso sería un opt-out— sino la meta-guardia del particionado: si
   * el reconocedor se angostara y dejara una de éstas afuera, la guardia pasaría en silencio sobre
   * una sentencia sin filtro.
   */
  esperadas: string[];
}

/**
 * Toda sentencia del módulo que opera sobre una fila de `libros` la elige por su clave primaria, con
 * igualdad exacta (AC-02, M5).
 *
 * **Por qué es una guardia de fuente.** Cambiar el `AND id = ?` del `SELECT` de control por un
 * comparador de rango —`AND id >= ?`, tres caracteres— hace que operar sobre un libro archivado lea
 * la primera fila activa con id mayor y escriba con el `libro_id` equivocado. Los tests de negocio lo
 * cazan **porque siembran dos libros**; esta guardia lo caza sin depender de cuántos haya sembrados y
 * cubre además las formas del mismo error que ninguna siembra alcanzaría —un `BETWEEN`, un `IN`, un
 * `!=`—.
 *
 * Se registra por módulo porque la exigencia no vale para todo `lib/db/`: `consultas.ts` busca a
 * propósito muchas filas y `libros.ts` inserta.
 *
 * **Lo que el barrido universal cubre, y lo que no.** `test/convenciones/sql.test.ts` recorre todo
 * `lib/db/` y exige una sola cosa a todos: que ninguna sentencia compare el identificador del libro
 * por rango. Eso **no** equivale a esta guardia —no exige el filtro por clave primaria, ni el
 * `server-only`, ni la constante en el `prepare()`— así que un módulo que se olvide de registrarse
 * acá no queda «cubierto contra la peor mutación», como afirmaba esta prosa. Lo que cierra el hueco
 * es que el registro sea **obligatorio**: el mismo archivo deriva qué módulos declaran SQL y se pone
 * rojo si alguno no está registrado en este registrador o en uno de sus hermanos.
 *
 * **Y por eso este registrador también aplica las cuatro reglas de M9.** Mientras no lo hacía, la
 * obligación se satisfacía sin que M9 mirara nada: un `lib/db/ajuste.ts` con
 * `const SQL_AJUSTAR = \`UPDATE libros SET ${'${COLUMNA}'} = ? WHERE id = ?\`` —interpolación pura,
 * que es exactamente lo que M9 prohíbe— registrado sólo acá dejaba la suite entera en verde
 * (medido: 321/321). El registro estaba, la obligación quedaba satisfecha, y las cuatro reglas no
 * lo alcanzaban. La alternativa era que el registro obligatorio contara sólo a los registradores
 * que llevan M9, y se descartó: eso deja que un módulo quede vigilado a medias con la suite en
 * verde, mientras que aplicar M9 desde los dos registradores no deja ninguna combinación floja. El
 * costo es que `lib/db/ventas.ts`, registrado con los dos, corre las cuatro reglas dos veces; la
 * redundancia es barata y el hueco no lo era. Lo exige la guardia
 * «cada registrador somete a su módulo a las cuatro reglas de M9» de
 * `test/convenciones/sql.test.ts`, para que un registrador nuevo no pueda nacer sin ellas.
 */
export function guardiaDeSentenciasSobreUnLibro({
  relativo,
  esperadas,
}: ModuloDeOperacionSobreUnLibro): void {
  describe(`las sentencias de ${relativo} eligen la fila por su clave primaria (AC-02, M5)`, () => {
    const declaraciones = declaracionesSql(relativo);

    guardiasDelSqlDeclarado(relativo);
    const sobreLibros = declaraciones.filter(({ sentencia }) => tocaLaTablaLibros(sentencia));

    it('reconoce las sentencias que operan sobre una fila de libros, y son más de una', () => {
      // Meta-guardia del particionado: con la lista vacía —o con una sola sentencia— la guardia de
      // abajo pasaría sin haber mirado la que importa. Se nombran las que hoy operan sobre `libros`
      // y además se exige que sean más de una, que es la forma que este ticket ya corrigió tres
      // veces. Que el extractor no se haya comido ninguna declaración lo afirma la meta-guardia de
      // `guardiaDeConvencionesDeSql()`, y por eso no se repite acá.
      const nombres = sobreLibros.map(({ nombre }) => nombre);

      for (const esperada of esperadas) {
        expect(
          nombres,
          `${relativo}: ${esperada} dejó de reconocerse como sentencia de libros`,
        ).toContain(esperada);
      }

      expect(nombres.length).toBeGreaterThan(1);
    });

    it('todas filtran por la clave primaria con igualdad exacta, nunca por rango', () => {
      expect(sobreLibros.length).toBeGreaterThan(0);

      for (const { nombre, sentencia } of sobreLibros) {
        expect(
          filtraPorClavePrimaria(sentencia),
          `${relativo} → ${nombre}: no filtra por la clave primaria con igualdad exacta`,
        ).toBe(true);
        expect(
          comparaElIdPorRango(sentencia),
          `${relativo} → ${nombre}: compara el identificador por rango`,
        ).toBe(false);
      }
    });
  });
}
