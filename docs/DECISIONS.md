# Decisiones de la primera versión

## Un espacio, distintas vistas

El tablero representa trabajo temporal. Las fichas de conocimiento representan comportamiento y decisiones que siguen disponibles después de cerrar ese trabajo. Son entidades distintas dentro del mismo espacio y se conectan mediante relaciones explícitas.

La jerarquía épica → historia → subtarea organiza el alcance. Las dependencias indican orden; «modifica» identifica documentación afectada; «consulta» enlaza contexto relevante. El grafo es una vista de estas relaciones, no el formato principal para capturar tarjetas.

## Edición y conocimiento

El paquete público `@fsaldivar.dev/planning` ofrece API de dominio y CLI de lectura/escritura. El núcleo interno conserva su ruta para la aplicación. El esquema ProseMirror se comparte entre la interfaz y el CLI para rechazar contenido que el editor no pueda abrir. Markdown se convierte a bloques con `marked`, una dependencia exclusiva del paquete Node que no entra en el ejecutable Tauri.

Las escrituras CLI se expresan como lotes con `expectedRevision` y referencias locales. Primero se aplican y validan sobre una copia; después se guardan bajo un bloqueo de directorio compartido con Rust. El guardado reemplaza el archivo de forma atómica, conserva una copia anterior y actualiza el contexto. La app solo adopta cambios externos cuando no tiene ediciones pendientes ni un diálogo o campo de edición activo. Ante conflicto, **Exportar copia y recargar** permite conservar la edición local antes de cargar el archivo canónico.

Los documentos se editan con ProseMirror y se guardan como un árbol estructurado. Markdown se genera para exportar y facilitar lectura selectiva. No hay un área para escribir código Markdown.

La capa de bloques conserva el esquema y los documentos existentes. Se añaden tablas con `prosemirror-tables`, listas de tareas y un atributo de lenguaje para código. El menú de inserción produce transacciones del editor, de modo que deshacer y persistir siguen el mismo camino. No se guarda HTML de interfaz ni se duplica el contenido en otra base.

El resaltado usa el núcleo de Highlight.js con seis lenguajes registrados. Markdown sigue siendo una exportación: tablas GFM, casillas y bloques de código con lenguaje. Las celdas combinadas se expanden sin repetir contenido en la exportación, porque GFM no conserva combinaciones de celdas.

Los bloques `code_block` con lenguaje `mermaid` usan una NodeView de Kairo, compartida por tarjetas, documentos y revisiones de solo lectura. La previsualización nunca reescribe la fuente. **Editar en Kairo** trabaja sobre una copia separada y **Aplicar cambios** produce una transacción de ProseMirror que actualiza Mermaid y su presentación local. El diseñador genera flujos; otras notaciones y directivas avanzadas requieren la acción visible **Aplicar como flujo Mermaid**. Los cambios de posición sin cambios semánticos conservan el texto original. Los módulos se cargan bajo demanda y cada vista destruye sus instancias al retirarse.

El atributo opcional `kairoLayout` conserva posiciones/tamaños y puertos asociados al texto exacto al que pertenecen. Solo se aplica si la fuente coincide y los valores son finitos y válidos; no modifica la autoridad semántica de Mermaid ni se exporta a Markdown. Los IDs de conexiones se alinean con el orden regenerado por el importador. Una edición manual invalida la presentación anterior. Aplicar contra una fuente cambiada o un bloque retirado se rechaza, y los documentos antiguos no necesitan migración.

El texto de nodos y conexiones se escapa con [entidades decimales de Mermaid](https://mermaid.js.org/syntax/flowchart.html#entity-codes-to-escape-characters), preservando comillas, delimitadores y saltos de línea sin convertirlos en estructura. Los errores y el código generado se insertan como texto, sin ejecutar HTML, estilos ni enlaces procedentes del diagrama.

Las superficies de navegación anidadas dirigen el zoom al lienzo enfocado. La rueda sin modificadores en un diagrama incrustado conserva el desplazamiento del documento; arrastrar mueve el encuadre. La fuente se revela automáticamente si la selección de teclado entra en ella, evitando un cursor oculto.

El desplazamiento normal no cambia el zoom. WebKit usa eventos de gesto para el pellizco; Chromium lo representa como rueda con Ctrl. Los comandos del menú de macOS se dirigen al documento o lienzo visible, dando prioridad al editor de un diálogo abierto. Referencias: [GestureEvent de WebKit](https://developer.apple.com/documentation/webkitjs/gestureevent), [menús de Tauri](https://v2.tauri.app/learn/window-menu/), [tablas de ProseMirror](https://github.com/ProseMirror/prosemirror-tables) y [API de Highlight.js](https://highlightjs.readthedocs.io/en/latest/api.html).

Un borrador documental no sobrescribe el contenido publicado. Publicar exige indicar cómo se verificó, conserva la revisión anterior y actualiza la vigencia. No se infiere que una documentación sea correcta por el simple hecho de haber cerrado una tarjeta.

Esta versión registra la verificación declarada por quien la utiliza; no ejecuta pruebas del producto ni confirma por sí sola la veracidad de esa evidencia.

## Tamaño y plataforma

Tauri usa el WebKit existente en macOS. La interfaz es TypeScript directo, sin un framework de componentes ni un navegador incluido. ProseMirror aporta el comportamiento real de selección, formato e historial. Kairo se importa bajo demanda. Las fuentes son locales y los símbolos se generan con AppKit.

La apariencia parte de controles compactos, una barra lateral, barra de herramientas y panel de propiedades, siguiendo convenciones de macOS. Se conservan personalización de acento, fuente y tamaño. Es una aplicación Tauri con interfaz WebKit; no una implementación SwiftUI.

## Integración con otras herramientas

El paquete de planificación no depende de Tauri ni del DOM. La primera integración para IA es un lector local por ID, relaciones y encabezado; sirve para comprobar la utilidad del modelo antes de añadir ejecución y escritura automatizadas.

Las interfaces futuras para agentes deberán respetar revisión esperada, validación del documento, cambios propuestos separados y evidencia de cierre. No deberán escribir directamente en las copias Markdown ni marcar contenido como verificado de forma implícita.
