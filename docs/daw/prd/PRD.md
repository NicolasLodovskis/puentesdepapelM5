# PRD-001: Manejo de Stock — Puentes de Papel

> Software local para que la dueña de la librería "Puentes de Papel" gestione stock y precios de sus libros: ABM, ventas, alta masiva y actualización de precios individual y masiva por Excel, y consulta por nombre/editorial o por foto.

| Campo | Detalle |
|---|---|
| **ID** | PRD-001 |
| **Producto** | Manejo de Stock "Puentes de Papel" |
| **Tipo** | Software de gestión de stock y precios para tienda de libros |
| **Usuarios** | Un único usuario / un único acceso |
| **Estado** | Borrador (endurecido) |
| **Última enmienda** | 2026-07-29 — de 22 RF / 2 RNF / 21 AC a **30 RF / 3 RNF / 37 AC**. (1) RF-13/RF-14: orígenes *"alta manual"* y *"reactivación"*, cláusula de no-cambio y su excepción por reactivación. (2) RF-17/RF-24: unicidad global del título normalizado; la editorial no forma parte de la clave. (3) Nuevos RF-23 a RF-30: edición de título y editorial, consulta de archivados, reactivación manual, reporte de precios persistido, orden de precedencia de clasificación de filas, restricciones sobre libros archivados, y reglas de reconocimiento de encabezados. (4) RF-08, RF-19 y RF-22 ampliados. (5) Nuevo RNF-03 (5.000 filas) y escala de referencia en RNF-01/RNF-02. (6) Sección 7: resguardo de datos fuera de alcance. Sección 8: restricción de la clave sin editorial. (7) Nuevos AC-22 a AC-37. |
| **Enmienda** | 2026-08-02 — RF-10 y AC-11: la búsqueda devuelve los resultados **ordenados alfabéticamente por título** (comparación en español, insensible a mayúsculas y acentos), y con el campo de búsqueda **vacío** lista el **catálogo activo completo** en lugar de no devolver nada. Decisión de la propietaria: sin la vista de catálogo, la única forma de ver un libro es saber de antemano cómo se llama. |
| **Enmienda** | 2026-07-30 — de 30 RF / 3 RNF / 38 AC a **31 RF / 3 RNF / 38 AC**. Decisión de la propietaria: **el precio es un entero > 0, sin decimales**; el sistema no maneja centavos. (1) RF-01 y RF-02 fijan el dominio del precio. (2) Nuevo RF-31: reglas de interpretación del precio en todo origen — se acepta la parte decimal cero (*1234,00*), se rechaza sin redondear toda parte decimal distinta de cero, el separador de miles y el valor no numérico, y se distingue el precio ausente del no numérico. (3) RF-21 y AC-18 incluyen el decimal como motivo de fila inválida. (4) AC-01 exige precio entero. (5) Nuevo AC-38. Impacto en diseño: R5 pasa de centavos a entero de moneda, y las columnas `precio_centavos`, `precio_anterior_centavos`, `precio_nuevo_centavos` y `precio_venta_centavos` pasan a `precio`, `precio_anterior`, `precio_nuevo` y `precio_venta`. |

---

## 1. Contexto y Problema

La librería "Puentes de Papel" no tiene un sistema para llevar su inventario: hoy el stock y los precios se manejan de forma manual, lo que hace lento y propenso a errores mantenerlos al día y consultarlos.

**Persona única — la dueña/librera.** Es la única usuaria y tiene un único acceso al sistema. Necesita:

- Dar de alta los libros y darlos de baja cuando dejan de venderse.
- Subir y bajar el stock de manera rápida.
- Consultar el precio de un libro de manera rápida, por búsqueda (nombre/editorial) o por foto (cuando lo tiene en la mano y no recuerda el título exacto).
- Actualizar precios de forma ágil, tanto individualmente como en masa mediante un archivo Excel que le envía la distribuidora.

No hay otros roles ni otros usuarios: es un sistema mono-usuario, de escritorio/local.

---

## 2. Objetivos

- Mantener el **stock actualizado** en todo momento.
- Mantener los **precios actualizados**, incluyendo actualizaciones masivas.
- Permitir **consultar rápidamente** stock y precio (por búsqueda y por foto).
- Conservar **trazabilidad** (historial) de ventas, precios y stock, incluyendo el valor anterior y el origen de cada cambio.
- Permitir el **alta masiva de libros por Excel** (columnas *libro*, *editorial*, *stock* y *precio*), para simplificar principalmente la carga inicial de todo el stock.

---

## 3. Requerimientos Funcionales

| ID | Requerimiento |
|---|---|
| **RF-01** | El sistema debe permitir dar de alta un libro con título, editorial, foto (opcional), cantidad en stock y precio. El **precio es un entero > 0**, sin decimales: los importes se manejan en unidades enteras de moneda y el sistema no maneja centavos. |
| **RF-02** | El sistema debe permitir modificar el precio de un libro, respetando el dominio del precio (entero > 0, RF-01). |
| **RF-03** | El sistema debe permitir modificar manualmente la cantidad en stock de un libro. |
| **RF-04** | El sistema debe permitir dar de baja un libro mediante **baja lógica** (marcarlo como archivado/inactivo, conservando su historial). |
| **RF-05** | El sistema debe permitir marcar un libro como vendido. |
| **RF-06** | El sistema debe permitir subir un archivo Excel **de actualización de precios** con las columnas *libro* y *precio*. |
| **RF-07** | El sistema debe actualizar el precio de los libros del Excel de actualización de precios cuyo título, tras normalizarlo (minúsculas, sin acentos, sin puntuación e ignorando el orden del artículo), coincida con un libro **activo** existente. Los libros archivados no se actualizan. |
| **RF-08** | El sistema debe informar, sin modificar datos, las filas del Excel de actualización de precios sin coincidencia y, en un apartado separado rotulado *"coincide con un libro archivado — no actualizado"*, las filas cuyo título normalizado (RF-07) coincide con un libro **archivado** **o es casi-coincidencia (RF-09) de un libro archivado** (cantidad y detalle en ambos casos). |
| **RF-09** | El sistema debe destacar visualmente (otro color) las filas del Excel de actualización de precios que no coinciden exactamente pero son **casi-coincidencias** de un libro activo existente, para revisión manual (sin actualizarlas automáticamente). |
| **RF-10** | El sistema debe permitir buscar libros por nombre o por editorial, devolviendo los libros coincidentes con su precio, **ordenados alfabéticamente por título**. Con el campo de búsqueda **vacío** debe listar el **catálogo activo completo** con el mismo orden: es la vista de catálogo, y evita que la única forma de ver un libro sea saber de antemano cómo se llama. |
| **RF-11** | El sistema debe permitir consultar un libro por foto, devolviendo una **lista de candidatos** ordenada por similitud para que el usuario elija. |
| **RF-12** | El sistema debe guardar un historial de las ventas (fecha y precio de venta). |
| **RF-13** | El sistema debe guardar un historial de los cambios de stock (fecha, **cantidad anterior**, cantidad resultante y **origen** del cambio: venta, edición manual, alta manual, **reactivación** o alta por Excel). Una operación que deja la cantidad igual a la vigente **no** constituye un cambio: no modifica el libro ni genera entrada de historial. **Excepción**: una reactivación (RF-20, RF-26) siempre registra su entrada, incluso si la cantidad no cambia, porque es un evento de ciclo de vida que debe quedar trazado. |
| **RF-14** | El sistema debe guardar un historial de los cambios de precio (fecha, **precio anterior**, nuevo precio y **origen** del cambio: edición manual, alta manual, **reactivación**, actualización masiva por Excel o alta por Excel). Una operación que deja el precio igual al vigente **no** constituye un cambio: no modifica el libro ni genera entrada de historial. **Excepción**: una reactivación (RF-20, RF-26) siempre registra su entrada, incluso si el precio no cambia, porque es un evento de ciclo de vida que debe quedar trazado. |
| **RF-15** | El sistema debe permitir revisar los historiales de precio, ventas **y stock**. |
| **RF-16** | El sistema debe permitir filtrar los historiales por fecha, título y editorial. |
| **RF-17** | El sistema debe impedir dar de alta un libro cuyo título, una vez normalizado (RF-07), coincida con el de **cualquier otro libro existente, activo o archivado**: el título normalizado es único en todo el catálogo. La editorial **no** forma parte de la clave (ver Restricción en la sección 8). Cuando el coincidente está archivado, el sistema debe informarlo y ofrecer reactivarlo en lugar de crear un duplicado. |
| **RF-18** | El sistema debe permitir subir un archivo Excel de **alta masiva** con las columnas *libro*, *editorial*, *stock* y *precio*, mediante un flujo separado del de actualización de precios (RF-06). |
| **RF-19** | El sistema debe crear un libro por cada fila **válida** del Excel de alta masiva cuyo título, tras normalizarlo (RF-07), **no** coincida con ningún libro existente (ni activo ni archivado). En este flujo la comparación es **sólo por coincidencia exacta**: una variante de edición es un **libro distinto** y se crea como tal — si existe *"El Principito"*, la fila *"El Principito (tapa dura)"* crea un libro nuevo. La detección de casi-coincidencias (RF-09) es **exclusiva** del flujo de actualización de precios, donde aplicar un precio a la edición equivocada corrompería un dato; en el alta masiva la usuaria carga su propio inventario y las ediciones distintas son ejemplares distintos que conviven. |
| **RF-20** | El sistema debe **reactivar** (marcar como activo) el libro **archivado** cuyo título normalizado (RF-07) coincida con una fila válida del Excel de alta masiva, actualizando su stock y su precio con los valores de la fila. |
| **RF-21** | El sistema debe reportar, **sin crear ni modificar libros**, las filas del Excel de alta masiva que se omiten —duplicadas (coinciden con un libro **activo**, RF-17) o inválidas (falta *libro*, *editorial*, *stock* o *precio*; o *stock* no es un entero ≥ 0; o *precio* no es un entero > 0, **lo que incluye un precio con decimales** — RF-01, RF-31)— indicando la cantidad y el motivo de cada una. |
| **RF-22** | En cualquiera de los dos flujos de Excel (actualización de precios y alta masiva), cuando dos o más filas tienen títulos que normalizan (RF-07) al mismo valor, el sistema debe procesar únicamente la primera ocurrencia y reportar las restantes como omitidas por *"duplicada dentro del archivo"*. La condición es **posicional**: toda ocurrencia posterior a la primera se reporta como duplicada **sin importar si la primera se aplicó o no** (p. ej. si la primera resultó inválida, la segunda tampoco se aplica). Cuentan como ocurrencia todas las filas con título legible, aun si son inválidas en otro campo. |
| **RF-23** | El sistema debe permitir modificar el **título** y la **editorial** de un libro existente, para corregir errores de carga. Ambos deben quedar no vacíos. |
| **RF-24** | El sistema debe impedir modificar el título de un libro cuando el nuevo título, tras normalizarlo (RF-07), coincide con el de **cualquier otro libro existente, activo o archivado** (misma regla de unicidad global que RF-17, aplicada a la edición). |
| **RF-25** | El sistema debe permitir consultar los libros **archivados**, de modo que el usuario pueda encontrar uno para reactivarlo. |
| **RF-26** | El sistema debe permitir **reactivar** manualmente un libro archivado, fijando su stock y su precio en el momento de la reactivación, y registrando ambas entradas de historial con origen **"reactivación"** (distinto de "edición manual", para que el historial permita reconstruir que hubo una reactivación). La reactivación también debe poder iniciarse desde el rechazo de un alta duplicada contra un libro archivado (RF-17). |
| **RF-27** | El sistema debe **persistir el reporte** de cada procesamiento de un Excel de **actualización de precios** (RF-06), con su fecha, los totales por categoría y el detalle de las filas no aplicadas con su motivo, y debe permitir consultar los reportes anteriores. Los reportes no se editan ni se borran. |
| **RF-28** | El sistema debe clasificar cada fila de Excel en **una sola** categoría, evaluando en este **orden de precedencia** y quedándose con la primera que dé positivo. Común a los dos flujos: **(1)** inválida (falta un campo, o stock/precio fuera de rango); **(2)** duplicada dentro del archivo (RF-22). Luego, en el flujo de **alta masiva**: **(3)** coincidencia exacta con un libro activo → duplicada de activo (RF-21); **(4)** coincidencia exacta con un libro archivado → reactivar (RF-20); **(5)** sin coincidencia → crear (RF-19). Y en el flujo de **actualización de precios**: **(3)** coincidencia exacta con un activo → aplicar, o *sin cambio* si el precio es igual al vigente (RF-07, RF-14); **(4)** coincidencia exacta con un archivado → *coincide con un libro archivado* (RF-08); **(5)** casi-coincidencia de un activo → *casi-coincidencia* (RF-09); **(6)** casi-coincidencia de un archivado → *coincide con un libro archivado* (RF-08); **(7)** nada de lo anterior → *sin coincidencia* (RF-08). Las categorías son mutuamente excluyentes: la suma de todas iguala el total de filas del archivo. |
| **RF-29** | Sobre un libro **archivado** el sistema debe **impedir** modificar el stock y el precio —lo que incluye marcarlo como vendido (RF-05), que descuenta stock—, y debe **permitir** modificar su título y su editorial (RF-23, sujeto a RF-24) y reactivarlo (RF-26). Recíprocamente, la modificación de stock y precio (RF-02, RF-03) y la venta (RF-05) sólo aplican a libros **activos**. |
| **RF-30** | El sistema debe reconocer los encabezados de un Excel (RF-06, RF-18) con estas reglas, comunes a los dos flujos: **(a)** se usa únicamente la **primera hoja** del libro; **(b)** el encabezado es la **primera fila no vacía**; **(c)** los nombres se comparan recortando espacios y sin distinguir mayúsculas ni acentos; **(d)** **no se aceptan sinónimos**: el nombre debe coincidir con el declarado (*libro* y *precio*; más *editorial* y *stock* en el alta masiva), porque interpretar *"importe"* o *"costo"* como precio de venta sería adivinar la intención del archivo; **(e)** las columnas extra se ignoran sin error; **(f)** si una columna obligatoria aparece **repetida**, el archivo se rechaza, porque elegir una de las dos sería adivinar. Todo rechazo por encabezados debe indicar qué columnas obligatorias faltan o están repetidas **y listar los encabezados encontrados**, para que el usuario pueda corregir el archivo. |
| **RF-31** | El sistema debe interpretar el precio, en cualquier origen (formulario o Excel), con estas reglas: **(a)** el valor válido es un **entero > 0** (RF-01); **(b)** se acepta un valor cuya parte decimal sea **cero** (*1234*, *1234,00*, *1234.0*), porque denota exactamente ese entero; **(c)** se **rechaza** todo valor con parte decimal distinta de cero (*1234,50*), **sin redondearlo**, porque alterar un importe por cuenta propia corrompería un dato de precio; **(d)** se rechaza todo valor no numérico, y se distingue en el reporte el caso *"falta el precio"* del caso *"el precio no es un número"*; **(e)** se rechaza un valor con separador de miles (*1.234,50*), porque decidir si el punto separa miles o decimales sería adivinar. Todo rechazo se informa como fila inválida indicando el motivo (RF-21, RF-28). |

---

## 4. Requerimientos No Funcionales

| ID | Requerimiento |
|---|---|
| **RNF-01** | La consulta de precio por búsqueda por nombre o editorial debe responder en **< 1 s (p95)**, medida sobre el catálogo de referencia (~2.000 libros). |
| **RNF-02** | La consulta de precio por búsqueda por foto debe responder en **< 3 s (p95)**, medida sobre el catálogo de referencia (~2.000 libros). |
| **RNF-03** | El sistema debe procesar un archivo Excel de hasta **5.000 filas** en cualquiera de los dos flujos (actualización de precios y alta masiva) sin fallar ni truncar filas. |

> **Volumen de referencia**: catálogo de aproximadamente **2.000 libros** y archivos Excel de hasta **5.000 filas**. Es la escala contra la que se verifican RNF-01, RNF-02 y RNF-03.

> La persistencia en SQLite (un único archivo, sin servidor) se documenta como **Restricción** en la sección 8, no como RNF, por ser una decisión de arquitectura sin métrica asociada.

---

## 5. Criterios de Aceptación

Formato: **Dado** (precondición) → **Cuando** (acción) → **Entonces** (resultado medible). Cada criterio es binario (pasa / no pasa).

| ID | RF | Criterio |
|---|---|---|
| **AC-01** | RF-01 | Dado un formulario con título y editorial no vacíos, stock entero ≥ 0 y precio entero > 0, cuando el usuario confirma el alta, entonces el libro queda persistido en la base de datos y es recuperable en una consulta posterior; y dado un formulario donde el título o la editorial están vacíos, el stock no es un entero ≥ 0, o el precio no es un entero > 0, cuando el usuario confirma el alta, entonces el sistema la rechaza con un mensaje y no persiste el libro. |
| **AC-02** | RF-02, RF-14 | Dado un libro existente con precio P, cuando el usuario cambia su precio a P', entonces el nuevo precio P' queda guardado en la base de datos **y** se agrega una entrada en el historial de precio con fecha, precio anterior (P), nuevo precio (P') y origen ("edición manual"). |
| **AC-03** | RF-03, RF-13 | Dado un libro existente con stock S, cuando el usuario modifica manualmente su stock a S', entonces el nuevo stock S' queda guardado **y** se agrega una entrada en el historial de stock con fecha, cantidad anterior (S), cantidad resultante (S') y origen ("edición manual"). |
| **AC-04** | RF-04 | Dado un libro activo, cuando el usuario lo da de baja, entonces queda marcado como archivado, deja de aparecer en las búsquedas (RF-10 y RF-11) y su historial se conserva accesible. |
| **AC-05** | RF-05, RF-12, RF-13 | Dado un libro con stock S ≥ 1, cuando el usuario lo marca como vendido, entonces el stock se descuenta en 1, se registra la venta en el historial de ventas (fecha y precio de venta, igual al precio vigente del libro en ese momento) y se registra el cambio en el historial de stock con fecha, cantidad anterior (S), cantidad resultante (S − 1) y origen ("venta"). |
| **AC-06** | RF-05 | Dado un libro con stock = 0, cuando el usuario intenta marcarlo como vendido, entonces el sistema lo impide, el stock no cambia y no se registra venta. |
| **AC-07** | RF-06 | Dado un archivo Excel de actualización de precios, cuando se sube: si contiene las columnas *libro* y *precio* el sistema lo acepta y lee su contenido; si le falta alguna de esas columnas, el sistema lo rechaza con un mensaje. |
| **AC-08** | RF-07, RF-14 | Dado un Excel de actualización de precios aceptado, cuando se procesa, entonces por cada fila cuyo título normalizado (según RF-07) coincide con un libro **activo** se actualiza su precio en la base de datos **y** se agrega una entrada en el historial de precio con fecha, precio anterior, nuevo precio y origen ("actualización masiva por Excel"); los libros archivados que coincidan no se modifican. |
| **AC-09** | RF-08 | Dado un Excel de actualización de precios procesado, cuando hay filas sin coincidencia y/o filas cuyo título normalizado coincide con un libro archivado, entonces ninguna de esas filas modifica datos y se listan en el reporte: las sin coincidencia como tales, y las que coinciden con un libro archivado en un apartado separado rotulado "coincide con un libro archivado — no actualizado", cada una con su cantidad y detalle. |
| **AC-10** | RF-09 | Dado un Excel de actualización de precios procesado, cuando una fila no coincide exactamente pero, tras la normalización (RF-07), comparte el núcleo del título con un libro activo existente difiriendo sólo en variantes de edición entre paréntesis (p. ej. "tapa blanda" / "rústica" / "versión rústica"), entonces esa fila se muestra destacada en otro color como casi-coincidencia y no se actualiza automáticamente. *(Verificable con un set de ejemplos conocidos.)* |
| **AC-11** | RF-10 | Dado uno o más libros activos cargados, cuando el usuario busca por nombre o por editorial, entonces el sistema devuelve los libros coincidentes con su precio, ordenados alfabéticamente por título, en < 1 s (p95); y cuando el campo de búsqueda está vacío, entonces devuelve todos los libros activos con el mismo orden y dentro del mismo presupuesto. |
| **AC-12** | RF-11 | Dado un libro activo con foto, cuando el usuario busca a partir de una foto de ese libro, entonces el sistema devuelve una lista de candidatos ordenada por similitud en la que el libro correcto aparece entre los primeros 5, en < 3 s (p95). |
| **AC-13** | RF-12, RF-13, RF-14, RF-15 | Dado un historial con registros (ventas, stock o precio), cuando el usuario lo abre, entonces el sistema muestra cada registro con su fecha y sus valores: en ventas, el precio de venta; en precio, el precio anterior, el nuevo precio y el origen; en stock, la cantidad anterior, la cantidad resultante y el origen. |
| **AC-14** | RF-16 | Dado un historial con registros, cuando el usuario aplica un filtro por fecha y/o título y/o editorial, entonces el sistema muestra únicamente los registros que cumplen el filtro. |
| **AC-15** | RF-17 | Dado un libro existente cuyo título normalizado es T —esté **activo o archivado**—, cuando el usuario intenta dar de alta otro libro cuyo título también normaliza a T, entonces el sistema lo impide y no crea el segundo libro; y cuando el coincidente está archivado, el mensaje lo indica y ofrece reactivarlo. |
| **AC-16** | RF-18 | Dado un archivo Excel de alta masiva, cuando se sube: si contiene las columnas *libro*, *editorial*, *stock* y *precio* el sistema lo acepta y lee su contenido; si le falta alguna de esas columnas, el sistema lo rechaza con un mensaje. Este flujo es independiente del de actualización de precios (RF-06). |
| **AC-17** | RF-19 | Dado un Excel de alta masiva aceptado, cuando se procesa, entonces por cada fila válida cuyo título normalizado (RF-07) no coincide con ningún libro existente (ni activo ni archivado) se crea un libro con su título, editorial, stock y precio, quedando persistido y recuperable en una consulta posterior. |
| **AC-18** | RF-21 | Dado un Excel de alta masiva procesado, cuando hay filas duplicadas (título normalizado coincide con un libro **activo**, RF-17) o inválidas (falta *libro*, *editorial*, *stock* o *precio*; o *stock* no es un entero ≥ 0; o *precio* no es un entero > 0, incluido un precio con decimales), entonces esas filas no crean ni modifican ningún libro y se listan en un reporte con su cantidad y el motivo de cada omisión. |
| **AC-19** | RF-19, RF-13, RF-14 | Dada una fila válida del Excel de alta masiva que crea un libro nuevo con stock S y precio P, cuando se crea el libro, entonces se agrega una entrada en el historial de stock (fecha, cantidad anterior 0, cantidad resultante S, origen "alta por Excel") **y** una entrada en el historial de precio (fecha, precio anterior 0, nuevo precio P, origen "alta por Excel"). |
| **AC-20** | RF-20, RF-13, RF-14 | Dado un libro **archivado** con stock S y precio P cuyo título normalizado (RF-07) coincide con una fila válida del Excel de alta masiva que trae stock S' y precio P', cuando se procesa el Excel, entonces el libro queda marcado como activo, su stock pasa a S' y su precio a P', y se agregan una entrada en el historial de stock (fecha, cantidad anterior S, cantidad resultante S', origen "alta por Excel") **y** una entrada en el historial de precio (fecha, precio anterior P, nuevo precio P', origen "alta por Excel"); y ambas entradas se agregan **también cuando S' = S y/o P' = P**, por ser una reactivación (RF-13, RF-14). |
| **AC-21** | RF-22 | Dado un Excel (de actualización de precios o de alta masiva) con dos o más filas cuyos títulos normalizan (RF-07) al mismo valor, cuando se procesa, entonces solo la primera ocurrencia se procesa según su flujo y cada fila duplicada posterior no se procesa y se lista en el reporte con el motivo "duplicada dentro del archivo". |
| **AC-22** | RF-01, RF-13, RF-14 | Dada un alta manual válida (RF-01) con stock S y precio P, cuando el usuario confirma el alta, entonces se agrega una entrada en el historial de stock (fecha, cantidad anterior 0, cantidad resultante S, origen "alta manual") **y** una entrada en el historial de precio (fecha, precio anterior 0, nuevo precio P, origen "alta manual"). |
| **AC-23** | RF-23 | Dado un libro existente, cuando el usuario cambia su título y/o su editorial por valores no vacíos, entonces los nuevos valores quedan persistidos y el libro pasa a ser recuperable por ellos en la búsqueda (RF-10); y cuando el nuevo título o la nueva editorial quedan vacíos, el sistema lo rechaza con un mensaje y no modifica el libro. |
| **AC-24** | RF-24 | Dado un libro existente cuyo título normalizado es T —esté **activo o archivado**—, cuando el usuario intenta cambiar el título de otro libro a un valor que también normaliza a T, entonces el sistema lo impide y no modifica el libro. |
| **AC-25** | RF-25 | Dados uno o más libros archivados y uno o más activos, cuando el usuario abre la consulta de archivados, entonces el sistema lista únicamente los archivados. |
| **AC-26** | RF-26, RF-13, RF-14 | Dado un libro archivado con stock S y precio P, cuando el usuario lo reactiva fijando stock S' y precio P', entonces el libro queda marcado como activo, vuelve a aparecer en las búsquedas (RF-10), su stock pasa a S' y su precio a P', y se agregan una entrada en el historial de stock (fecha, cantidad anterior S, cantidad resultante S', origen "reactivación") **y** una entrada en el historial de precio (fecha, precio anterior P, nuevo precio P', origen "reactivación"); y ambas entradas se agregan **también cuando S' = S y/o P' = P**. |
| **AC-27** | RF-13, RF-14, RF-07, RF-08 | Dado un libro activo con precio P, cuando se procesa una fila de Excel de actualización de precios que coincide con él y trae el mismo precio P, entonces el libro no se modifica, no se agrega ninguna entrada al historial de precio, y la fila se informa como coincidente **sin cambio**; y, en consecuencia, procesar dos veces el mismo Excel deja exactamente las mismas entradas de historial que procesarlo una vez. |
| **AC-28** | RF-27 | Dado un Excel de actualización de precios procesado, cuando el procesamiento termina, entonces su reporte queda persistido con fecha, totales por categoría y el detalle de cada fila no aplicada con su motivo; y cuando el usuario abre la consulta de reportes anteriores, entonces ese reporte sigue disponible con el mismo contenido, sin opción de editarlo ni borrarlo. |
| **AC-29** | RF-17 | Dado un libro cargado con título T y editorial E1, cuando el usuario intenta dar de alta otro libro con el mismo título T y editorial E2 ≠ E1, entonces el sistema lo impide y no crea el segundo libro (la editorial no forma parte de la clave — sección 8). |
| **AC-30** | RF-28 | Dada una fila que califica para más de una categoría, cuando se la clasifica, entonces se le asigna **una sola** según el orden de RF-28: una fila con un campo faltante y título repetido de una fila anterior se reporta como *inválida* (no como duplicada); una fila con título repetido que además coincide con un libro activo se reporta como *duplicada dentro del archivo* (no como duplicada de activo); y una fila cuyo título coincide exactamente con un libro activo y a la vez es casi-coincidencia de otro se resuelve por la coincidencia exacta. |
| **AC-31** | RF-22, RF-28 | Dado un Excel donde la **primera** ocurrencia de un título es inválida y una ocurrencia posterior del mismo título es válida, cuando se procesa, entonces **ninguna de las dos se aplica**: la primera se reporta como *inválida* y la posterior como *duplicada dentro del archivo*. |
| **AC-32** | RF-08, RF-09, RF-28 | Dado un libro **archivado** y una fila del Excel de actualización de precios que es casi-coincidencia (RF-09) de ese libro, cuando se procesa, entonces no se modifica ningún dato y la fila se lista en el apartado *"coincide con un libro archivado — no actualizado"*, no como *sin coincidencia* ni como *casi-coincidencia*. |
| **AC-33** | RF-19 | Dado un libro existente titulado *"El Principito"*, cuando se procesa un Excel de **alta masiva** con una fila válida titulada *"El Principito (tapa dura)"*, entonces se **crea un libro nuevo** con ese título y ambos conviven en el catálogo: en este flujo la variante de edición no se trata como casi-coincidencia. |
| **AC-34** | RF-29 | Dado un libro **archivado**, cuando el usuario intenta modificar su stock o su precio, o marcarlo como vendido, entonces el sistema lo impide con un mensaje y no modifica nada ni escribe historial; y cuando el usuario modifica su título o su editorial (respetando RF-24), o lo reactiva (RF-26), entonces la operación se permite. |
| **AC-35** | RF-29, RF-02, RF-03, RF-05 | Dado un libro **activo**, cuando el usuario modifica su stock o su precio, o lo marca como vendido, entonces la operación se permite: esas tres operaciones sólo aplican a libros activos. |
| **AC-36** | RF-30 | Dado un Excel cuyo encabezado está en la primera fila no vacía de la primera hoja, con nombres que difieren sólo en mayúsculas, acentos o espacios sobrantes (p. ej. `" Precio "`), y con columnas extra, cuando se sube, entonces el sistema lo acepta, reconoce las columnas obligatorias e ignora las extra sin error. |
| **AC-37** | RF-30 | Dado un Excel en el que una columna obligatoria aparece con un nombre distinto del declarado (p. ej. *"importe"* en lugar de *precio*) **o** aparece repetida, cuando se sube, entonces el sistema lo rechaza sin modificar ningún dato, y el mensaje indica qué columnas faltan o están repetidas **y lista los encabezados encontrados**. |
| **AC-38** | RF-31, RF-01 | Dado un precio ingresado por formulario o leído de un Excel, cuando su valor es *1234*, *1234,00* o *1234.0*, entonces se interpreta como el entero 1234 y la operación se aplica; y cuando su valor tiene parte decimal distinta de cero (*1234,50*), trae separador de miles (*1.234,50*), no es numérico o está ausente, entonces la operación se rechaza **sin redondear ni completar el valor**, y el motivo se informa distinguiendo el precio ausente del no numérico y del decimal. |

---

## 6. Control de Acceso

El sistema es **mono-usuario con un único acceso local y sin autenticación** (sin login, sin roles, sin multiusuario). Por lo tanto **no aplica** un criterio de aislamiento de datos entre usuarios: no existe un segundo usuario del cual proteger los datos. Esta ausencia es una decisión explícita, no una omisión.

---

## 7. Fuera de Alcance

- Tienda virtual para clientes, con opción de compra.
- Módulo de facturación (emisión de facturas, comprobantes fiscales, integración con AFIP/organismos impositivos y gestión de datos fiscales de clientes).
- Autenticación, login, roles o soporte multiusuario.
- Borrado físico de libros (la baja es siempre lógica — RF-04).
- Resguardo de datos: backup automático, exportación de la base y restauración desde una copia. El resguardo del archivo `.db` es responsabilidad de la usuaria, copiándolo por fuera del sistema. Es un **riesgo asumido**: una falla de disco o una corrupción del archivo implica perder el inventario y los historiales.
- Creación de libros a partir del Excel de **actualización de precios** (RF-06): en ese flujo las filas sin coincidencia sólo se reportan (RF-07/RF-08). El alta de libros por Excel se hace únicamente por el flujo dedicado de **alta masiva** (RF-18/RF-19/RF-20/RF-21).

---

## 8. Riesgos, Restricciones y Dependencias

| Tipo | Descripción | Mitigación |
|---|---|---|
| **Restricción** | La persistencia se implementa con **SQLite**: base embebida en un único archivo `.db`, sin servidor. No se reemplaza por otro motor. | — |
| **Restricción** | La identidad de un libro es su **título normalizado (RF-07), sin la editorial**. Por lo tanto **no pueden coexistir dos libros con el mismo título de editoriales distintas**: el segundo se rechaza en el alta (RF-17) y se omite como duplicado en el alta masiva (RF-21). Es una decisión explícita, no una omisión. | Si el negocio necesita stockear la misma obra de dos editoriales, se diferencia en el título al cargarlo (p. ej. "Hamlet (Cátedra)"), lo que además lo vuelve distinguible en la búsqueda y en el matcheo de los Excel. |
| **Riesgo** | La búsqueda por foto puede devolver el libro incorrecto en la primera posición. | Se devuelve una lista de candidatos (RF-11) para que el usuario elija; puede descartar el resultado incorrecto y repetir. |
| **Riesgo** | Filas del Excel que parecen coincidir pero corresponden a otra edición (variantes de tapa/versión) podrían actualizar el precio equivocado. | Se detectan como casi-coincidencias y se destacan para revisión manual, sin actualizar automáticamente (RF-09). |
| **Dependencia** | Base de datos SQLite (archivo local). | Backup periódico del archivo `.db`, **manual y a cargo de la usuaria**: el sistema no lo automatiza ni ofrece exportación (fuera de alcance, sección 7). |
| **Dependencia** | Librería local de búsqueda por foto (aún sin definir). | Evaluar y fijar la librería antes de implementar RF-11. |
