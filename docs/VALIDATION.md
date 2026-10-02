# Validación de v0.1 — 2 de octubre de 2026

## Compilación y reglas

- `npm test`: 6 pruebas correctas. Cierre condicionado por criterios, hijos, evidencia y documentación; ciclos de dependencias; historial y separación de borradores; importaciones inválidas; estructura del editor; evidencia publicada separada de la siguiente revisión.
- `npm run build`: TypeScript y compilación de producción correctos.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: prueba correcta de escritor con revisión obsoleta y copia anterior.
- `npm run desktop:build`: aplicación macOS Apple Silicon generada correctamente.
- `npm run size`: aplicación completa de aproximadamente **4.41 MiB**; recursos de interfaz de 0.42 MiB; JS y CSS comprimidos de 0.11 MiB. Estas medidas corresponden a la aplicación distribuible, no a los compiladores ni a la caché de desarrollo.

## Recorrido visual en navegador

Se creó una historia con contenido visual y criterio de aceptación; el borrador sobrevivió al cierre y a una recarga. Se aplicó negrita. El intento de terminar sin criterio ni evidencia fue rechazado.

Se vinculó la historia a documentación: el cierre quedó bloqueado hasta publicar una revisión verificada. Después se pudo terminar. Se añadió un nodo en Kairo, se guardó y se volvió a abrir el diagrama. El grafo permitió seleccionar una ficha y habilitó su apertura. El arrastre movió una historia de «Por hacer» a «En curso» y actualizó los contadores.

## Recorrido en la aplicación de macOS

- Apertura de la `.app` compilada, menús nativos y atajos `⌘N` y `⌘,`.
- Cambio a tema claro, acento morado y fuente redondeada; las preferencias sobrevivieron al reinicio. Al finalizar se restauró la apariencia del sistema.
- Creación de una historia, edición visual y negrita. El formato se recuperó después de cerrar y volver a abrir la aplicación.
- Creación y guardado de un diagrama de tres nodos. Se verificó el archivo del plugin de Kairo en disco y su recuperación después de importar el respaldo.
- Salida con `⌘Q`, proceso terminado y contenido conservado al reabrir.
- Exportación de JSON mediante el diálogo de macOS. La exportación conservó formato y diagrama.
- Importación de ese archivo. Cancelar el respaldo previo dejó la importación pendiente; aceptar el respaldo completó la importación y mostró «Espacio importado».
- Cambio de estado por el selector nativo y archivo reversible de la ficha de prueba.
- El índice de contexto coincidió con la revisión del archivo canónico. El lector local encontró la ficha de prueba y la excluyó del índice activo después de archivarla.

El gesto de arrastre **no se pudo verificar en macOS**: el controlador de automatización respondió `noWindowsAvailable`, aunque accesibilidad, edición, diálogos y capturas de esa misma ventana funcionaron. Se intentó con la ventana identificada por ruta, por bundle ID y después de elevarla. El arrastre está verificado en el navegador; el cambio de estado por selector está verificado en macOS.

## Evidencia y alcance

Las capturas locales están en `.qa/board-native.png`, `.qa/editor-native.png` y `.qa/board-browser.png`. Los respaldos de prueba están en `.qa/`; no se publicaron. La ficha «Prueba nativa · Editor y Kairo» quedó archivada y se puede restaurar.

Esta versión guarda un espacio local. No incluye colaboración multiusuario, sincronización remota, ejecución autónoma de agentes ni un servidor MCP de escritura. La revisión documental registra evidencia declarada por quien usa la aplicación. El lector de contexto es de solo lectura. No se ha validado Windows, Linux, Intel ni distribución notarizada.

## Editor por bloques y navegación — actualización del 2 de octubre

- `npm test`: 11 pruebas correctas. Las nuevas comprueban inserción con `/` y deshacer, tablas y sus comandos, conservación de bloques complejos al mover/duplicar/eliminar, exportación de tablas/casillas/lenguaje y separación de desplazamiento, comando y gesto de zoom.
- `npm run desktop:build`: TypeScript, Vite y compilación macOS correctos. Aplicación **4.44 MiB**, recursos **0.53 MiB**, JS/CSS comprimidos **0.14 MiB**. Vite advierte que el archivo principal supera el umbral local de 350 kB; mide aproximadamente 375 kB minimizado y 118 kB gzip.
- Navegador: creación mediante `/titulo`, `/tabla`, `/codigo` y `/tareas`; escritura y navegación entre celdas con Tab; selector Swift con resaltado; marcar tareas; duplicar, mover, deshacer y arrastrar bloques. El arrastre reveló y permitió corregir un `preventDefault` en el control de agarre que impedía iniciarlo.
- Navegador: desplazar el documento cambió `scrollTop` de 0 a 461 con zoom 1; `⌘+` mostró 110 %. En el grafo, la rueda cambió la traslación de Y 11.03 a −240.97 conservando escala 0.7621; el comando de zoom la cambió a 0.8383.
- macOS: pegado enriquecido de párrafo, H1, tabla y código Swift; menú `/`; añadir una fila y deshacer; duplicar una tabla con flechas/Enter y deshacer; desplazamiento vertical en el formulario y en la vista principal.
- macOS: **Visualización → Acercar** mostró 110 %, y `⌘0` volvió a 100 %. El controlador no logró reproducir las combinaciones físicas `⌘+/−`; los comandos de menú están comprobados y las combinaciones están comprobadas en navegador.
- Guardado nativo y reapertura conservaron una tabla de tres filas y el atributo `swift`. El archivo generado contiene tabla GFM y bloque de código con lenguaje; el lector de contexto devuelve únicamente la sección solicitada y conserva los límites de celdas.
- Se dejó la ficha reutilizable **Ejemplo · Documento por bloques**. Los documentos existentes, incluido el borrador pendiente de **Cómo funciona mi producto**, se conservaron.

El pellizco está conectado a eventos WebKit y Ctrl+rueda de Chromium; sus cambios de escala están cubiertos por la prueba de eventos, pero **el gesto físico del trackpad no está verificado**. El arrastre se comprobó en navegador; en macOS se comprobaron las acciones de bloque por menú y teclado.

La compilación final incluye la corrección del arrastre, cierre del menú al hacer clic fuera y validación de atributos. Su última reapertura quedó pendiente porque la Mac se bloqueó; la versión compilada permanece en `src-tauri/target/release/bundle/macos/Codaru Planning.app`.

La captura de la versión final en navegador está en `.qa/blocks-browser.png`. También se comprobó que hacer clic en el documento cierra el menú de bloques y que el zoom muestra 110 % y vuelve a 100 % sin cambiar el contenido. La vista de desarrollo conserva su propio ejemplo; la ficha nativa permanece separada.

## Mermaid dentro del documento — 2 de octubre

- 15 pruebas correctas: se añadieron inserción/deshacer de un diagrama, conservación literal al duplicar/mover/exportar, importación Kairo de nodos y conexiones, errores y tipos no compatibles, aviso de secuencias y reconocimiento de un bloque Mermaid pegado.
- Navegador: insertar **Diagrama** desde el menú, editar su fuente para añadir una decisión y conexiones etiquetadas, ocultarla, guardar y reabrir. Cambiar a `pie` mostró el aviso y retiró el SVG anterior; la fuente quedó intacta. Deshacer recuperó el diagrama. Pegar un bloque Markdown completo añadió un segundo diagrama independiente.
- Navegador: rueda sobre el segundo diagrama desplazó el documento de `scrollTop` 1114 a 783 sin cambiar ninguno de los encuadres. `⌘+` en ese lienzo cambió su escala de 0.25 a 0.275; el primer diagrama y el zoom del documento permanecieron iguales. **Ajustar** recuperó el encuadre.
- macOS: compilación Tauri abierta después de cerrar la anterior. Durante la comprobación el usuario empezó a usar la app; se continuó con inspección sin modificar su documento. Se observó el bloque Kairo en **Escribir los criterios de aceptación**. El archivo canónico y su exportación Markdown contienen el mismo Mermaid de tres nodos. Captura: `.qa/mermaid-native.png`.
- Compilación macOS correcta: aplicación **4.44 MiB**, recursos **0.56 MiB**, JS/CSS comprimidos **0.15 MiB**. El nuevo módulo Mermaid se carga bajo demanda y mide aproximadamente **7.04 kB gzip**; no se añadieron dependencias. Persiste el aviso de Vite por el archivo principal de aproximadamente 381 kB.

La edición, deshacer, varios bloques, error, pegado y zoom independiente se ejercitaron en navegador. En macOS se comprobó la vista y la persistencia en disco; no se repitió la edición automatizada para evitar interferir con el uso activo del usuario. El pellizco físico sigue pendiente. Kairo interpreta un subconjunto de Mermaid: no se afirma compatibilidad visual completa con todas sus notaciones.

## Edición visual de Mermaid con Kairo — 2 de octubre

- **19 pruebas correctas**. Nuevas comprobaciones: textos con comillas, delimitadores y saltos de línea; formas, conexiones y posiciones al serializar/reabrir; conservación del original al mover; aviso de conversión; invalidación de posiciones al editar la fuente; aplicación/deshacer/rehacer en una transacción y rechazo de una edición obsoleta.
- Navegador: cambiar «Idea» por «Idea validada», añadir «Publicar entrega», cambiar su forma a inicio/fin, conectarla desde Documentación viva y arrastrarla. Aplicar actualizó solo el primer bloque; el segundo quedó intacto. Deshacer restauró el Mermaid previo y rehacer recuperó la edición. Reabrir Kairo conservó exactamente las coordenadas SVG de todas las figuras, incluida la arrastrada. Añadir otra figura y cancelar no alteró la fuente.
- macOS: apertura de la nueva compilación; **Editar en Kairo**, añadir «Revisión», editar su texto desde el inspector, crear una conexión mediante los selectores y revisar el Mermaid generado. **Aplicar cambios** guardó cuatro figuras, la nueva conexión, el código y cuatro posiciones en disco. La exportación `context/<id>.md` contenía exactamente ese Mermaid. Deshacer recuperó los tres nodos iniciales; el borrador pendiente del usuario se mantuvo intacto.
- Se corrigió la inserción para colocar nuevas figuras fuera de las existentes y ajustar el encuadre; comprobado en navegador y en la compilación final de macOS. Captura: `.qa/mermaid-designer-native.png`. Se canceló el borrador de la captura para conservar el contenido original. No se introdujeron dependencias.
- Aplicación macOS: **4.46 MiB**, recursos **0.57 MiB**, JS/CSS comprimidos **0.16 MiB**. Persiste la advertencia de Vite por el archivo principal de aproximadamente 383 kB.

El arrastre se comprobó en navegador; la edición por controles, guardado/exportación y deshacer se comprobaron en macOS. El gesto físico del trackpad sigue pendiente. El exportador visual produce flujos Mermaid y presenta la conversión de notaciones avanzadas antes de aplicarla.

## Reducción de tamaño — 2 de octubre

- Base medida: 4 676 433 bytes (4.68 MB / 4.46 MiB). Excluir comandos sin permisos mediante `build.removeUnusedCommands` dio aproximadamente 4.26 MB; combinarlo con `opt-level = "z"` dio aproximadamente **3.58 MB / 3.41 MiB**, una reducción del **23.5 %**. Se conservaron ambos ajustes en la configuración de compilación.
- Se mantuvieron las funciones y permisos existentes. Referencias: [tamaño de Tauri](https://v2.tauri.app/concept/size/) y [perfiles de Cargo](https://doc.rust-lang.org/cargo/reference/profiles.html#opt-level). La selección de `z` se hizo por el tamaño medido; no se afirma una mejora de rendimiento.
- `npm run desktop:build` pasó TypeScript, Vite y compilación nativa. Se abrió la aplicación final de macOS y se verificaron la recuperación del espacio, la vista previa Mermaid, la apertura/cierre del editor Kairo y el diálogo nativo de exportación desde el menú. Se canceló la exportación y se conservó el borrador pendiente del usuario.

## Paquete npm y CLI de escritura — 2 de octubre

- **25 pruebas TypeScript/Node y 2 pruebas Rust correctas**. Incluyen Markdown GFM con Mermaid, esquema compartido con el editor, jerarquías, dependencias circulares, reglas de cierre, publicación con historial, rechazo de campos desconocidos, rollback de operaciones inválidas, simulación sin escritura, respaldo y revisión esperada.
- Dos procesos CLI intentaron escribir la misma revisión: solo uno guardó y el otro recibió conflicto; el índice documental y el archivo canónico conservaron la misma revisión.
- El tarball se instaló en una carpeta temporal fuera del repositorio. Se comprobaron el ejecutable `codaru-planning`, las importaciones ESM y TypeScript, y el flujo crear → consultar → seguir relaciones → exportar Mermaid. El paquete contiene 16 archivos y aproximadamente 22 kB comprimidos, sin contar dependencias externas. La aplicación Tauri se distribuye por separado.
- Validación nativa aislada en **Codaru Planning QA**, con identificador y almacenamiento separados. La app leyó las fichas y Mermaid creados por el CLI. Una escritura CLI mientras el tablero estaba abierto apareció automáticamente; después un criterio marcado en la app quedó visible en la siguiente lectura CLI.
- Se provocó un conflicto real: el CLI actualizó una ficha mientras el título tenía foco; un cambio local posterior no pudo sobrescribir esa revisión. **Exportar copia y recargar** conservó el texto local en un respaldo y abrió el texto actualizado por el CLI. Se verificaron ambos archivos. El formulario abierto por el usuario en la aplicación principal no se tocó.
- Los escritores actuales comparten `workspace.json.write-lock`; se conserva además el bloqueo de archivo anterior entre escritores nativos. Para usar el CLI se debe cerrar cualquier compilación anterior y abrir la compilación compatible. Un bloqueo de directorio abandonado tras un cierre abrupto requiere revisión manual; no se roba por antigüedad.
