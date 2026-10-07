# Codaru Planning

Primera aplicación local para planificar entregas y conservar el conocimiento del producto. Tauri 2, TypeScript, editor visual ProseMirror y Kairo. El ejecutable usa WebKit de macOS; no necesita un servidor, Node ni un navegador externo para funcionar.

## Abrir

La compilación local está en `src-tauri/target/release/bundle/macos/Codaru Planning.app`. Abre esa aplicación desde Finder. Se incluyen cinco fichas de ejemplo que puedes editar o archivar.

```sh
npm ci
npm run desktop
```

Para generar la aplicación de macOS:

```sh
npm run desktop:build
npm run size
```

El desarrollo requiere Node 22.12 o superior, Rust 1.89 o superior y las herramientas de Xcode. La aplicación construida es para Apple Silicon, macOS 13 o superior. Esta versión local no está notarizada para distribución pública.

## Qué puedes hacer

- Capturar ideas y crear épicas, historias y subtareas.
- Escribir con bloques visuales: encabezados, negritas, cursivas, listas, casillas, citas, tablas y código con lenguaje. Las plantillas separan qué queremos lograr, cómo resolverlo y criterios de aceptación. No se escribe sintaxis Markdown.
- Arrastrar tarjetas entre estados, agrupar por épica y buscar contenido.
- Relacionar fichas mediante dependencias, consultas y cambios documentales. Las dependencias circulares se rechazan.
- Vincular una historia con una ficha permanente de conocimiento. Al cambiar el trabajo, esa ficha queda por revisar; la historia exige documentación vigente, evidencia, criterios y subtareas cumplidas antes de terminar.
- Editar la siguiente revisión documental como borrador y publicarla con evidencia. Las versiones anteriores permanecen en el historial.
- Crear y guardar diagramas por ficha con `@fsaldivar.dev/diagram` y `@fsaldivar.dev/plugin`; navegar la jerarquía y las relaciones desde un grafo.
- Registrar entregas con las revisiones documentales correspondientes.
- Elegir tema automático/claro/oscuro, acento, fuente del sistema o local, tamaño y densidad.

La barra de menús, los controles de ventana, los diálogos de archivos y los atajos son de macOS. La interfaz utiliza SF Symbols obtenidos de AppKit y fuentes locales. Referencias de diseño: [barras laterales](https://developer.apple.com/design/human-interface-guidelines/sidebars), [tipografía](https://developer.apple.com/design/human-interface-guidelines/typography) y [ventanas Tauri](https://v2.tauri.app/learn/window-customization/).

## Editor por bloques

Escribe `/` al inicio de un párrafo para elegir un bloque; puedes filtrar con `/tabla`, `/codigo`, `/diagrama` o `/tareas`. Usa las flechas y Enter, o el botón **Insertar bloque**. Escape cierra el menú.

El control `⠿` de cada bloque permite arrastrarlo, convertirlo, duplicarlo, moverlo o eliminarlo. `⌥⇧↑/↓` mueve el bloque activo; `⌘Z` deshace. En una tabla, Tab pasa a la siguiente celda; la barra contextual añade filas/columnas y cambia el encabezado. `⌘Enter` sale del código o crea un párrafo después de una tabla.

Código incluye selector de Swift, JavaScript, TypeScript, JSON, Python, Shell o texto sin formato, y un botón para copiar. El resaltado carga solo esos lenguajes; bloques de más de 20 000 caracteres se conservan y editan sin resaltado para evitar pausas al escribir. Las tablas, las casillas y el lenguaje se conservan en disco y se exportan a Markdown.

Dos dedos desplazan. `⌘ + rueda`, `⌘+/−` y el pellizco cambian el zoom; `⌘0` vuelve al 100 %. También están en **Visualización → Acercar / Alejar / Tamaño real**. El documento permite de 60 % a 200 % sin modificar el tamaño de fuente guardado; el grafo y los diagramas conservan su propio encuadre. El zoom es temporal, independiente del contenido.

### Diagramas dentro del documento

Usa **Insertar bloque → Diagrama** o `/diagrama`. El documento muestra una vista previa de **Kairo**; **Fuente Mermaid** revela el texto para editarlo con actualización de la vista previa. **Ajustar** recupera el encuadre y **Copiar** copia la fuente. También puedes pegar un bloque completo delimitado por tres acentos graves y `mermaid`, o elegir **Mermaid · diagrama** en el selector de un bloque de código.

**Editar en Kairo** abre el diseñador visual. Puedes añadir figuras, cambiar texto y forma, moverlas, crear conexiones, duplicar, eliminar y deshacer. **Aplicar cambios** actualiza el código Mermaid del bloque en una sola operación deshacible; **Cancelar** conserva el documento. El panel **Mermaid que se guardará** permite revisar el resultado antes de aplicarlo. Las figuras nuevas aparecen fuera de las existentes.

El bloque se guarda con lenguaje `mermaid`, se conserva en el historial y se exporta como código Mermaid de Markdown. La posición y el tamaño de las figuras se guardan como presentación local, asociados a esa fuente, sin añadir JSON al Markdown. Al editar la fuente manualmente, las posiciones anteriores dejan de aplicarse. Los diagramas incrustados tienen zoom independiente; la rueda normal sigue desplazando el documento.

La edición visual genera **flujos Mermaid**. Si un cambio requiere convertir otra notación o sustituir estilos/directivas no representados por Kairo, se muestra el aviso y el botón **Aplicar como flujo Mermaid**. Abrir, cancelar o cambiar únicamente posiciones conserva la fuente original. No se ofrece edición visual en revisiones de solo lectura.

La compatibilidad corresponde al importador de Kairo: flujos, estados, clases, entidades, mapas mentales y secuencias. Es una vista estructural, no una implementación completa de Mermaid: las secuencias se muestran como participantes y mensajes, sin línea temporal; los estilos e interacciones Mermaid no se ejecutan. Los tipos no compatibles y los errores de importación muestran un aviso y conservan la fuente. La vista previa se limita a 50 000 caracteres y 200 nodos para mantener el editor ágil. No se añaden dependencias ni servicios remotos de renderizado.

## Datos y respaldo

Los datos se guardan en `~/Library/Application Support/dev.codaru.planning/`:

| Archivo o carpeta | Uso |
| --- | --- |
| `workspace.json` | Fuente de verdad: fichas, relaciones, revisiones, entregas, preferencias y borrador. |
| `workspace.previous.json` | Copia de la revisión anterior al último guardado. |
| `context/index.json` | Índice compacto para descubrir fichas y sus relaciones. |
| `context/<id>.md` | Exportación legible de cada ficha. |
| `diagrams/<id>.json` | Copia de los diagramas guardados explícitamente con el plugin de Kairo. |

El guardado usa reemplazo atómico, un bloqueo de archivo entre procesos y comparación de revisiones. Un archivo inválido no se reemplaza silenciosamente. La aplicación espera a guardar antes de cerrar. La copia anterior protege el último guardado; utiliza **Configuración → Exportar** para conservar respaldos históricos.

**Importar** valida el formato y requiere exportar una copia del espacio actual antes de sustituirlo. Cancelar ese respaldo cancela la importación. El límite actual del espacio es 24 MiB de JSON; incluye diagramas e historial. Archivar conserva el contenido, por lo que no reduce ese tamaño.

La vista de desarrollo en navegador usa un almacenamiento separado. No representa los datos de la aplicación nativa.

## Contexto para una IA

El paquete npm **`@fsaldivar.dev/planning`** incluye API TypeScript y el CLI **`codaru-planning`** de lectura y escritura. Su guía, contrato y ejemplo están en [packages/planning/README.md](packages/planning/README.md). El paquete contiene el modelo y el CLI; la aplicación visual Tauri se construye desde este repositorio.

```sh
npm install -g @fsaldivar.dev/planning
codaru-planning path
codaru-planning index
codaru-planning schema
codaru-planning apply --workspace /ruta/workspace.json --file cambios.json --dry-run
codaru-planning apply --workspace /ruta/workspace.json --file cambios.json
```

Una IA puede crear y actualizar fichas, criterios, relaciones, estados, borradores de conocimiento, revisiones verificadas y entregas. Los lotes llevan la revisión esperada y se guardan de forma atómica con respaldo. La aplicación comparte el bloqueo con el CLI y recupera cambios externos cuando está inactiva; no reemplaza ediciones o diálogos abiertos. Usa la compilación de escritorio de esta versión y cierra compilaciones anteriores antes de escribir con el CLI.

El lector local consulta el archivo canónico. Permite descubrir resúmenes, seguir aristas y leer únicamente una sección:

```sh
npm run context -- index
npm run context -- search "autenticación"
npm run context -- neighbors <id>
npm run context -- read <id> "Cómo funciona"
```

Para otro espacio: `--workspace /ruta/workspace.json`. `index` y `search` devuelven hasta 30 resultados con IDs y encabezados. `neighbors` incluye padre, hijos y relaciones dirigidas. El lector presenta contenido actual/publicado, señala la vigencia y no mezcla borradores pendientes con contenido verificado.

El Markdown es un formato de intercambio para herramientas. La edición humana es visual. `npm run context` conserva el lector anterior de solo lectura; el nuevo CLI añade escritura mediante operaciones validadas. No hay ejecución autónoma de tareas ni servidor MCP en esta versión.

## Estructura

- `packages/planning-core`: modelo y reglas independientes de la interfaz, reutilizables en otros sistemas.
- `packages/planning`: paquete npm público, operaciones transaccionales, importación Markdown y CLI para IA.
- `src`: host visual, editor, persistencia y adaptador de Kairo. El editor de diagramas se carga al abrirlo.
- `src-tauri`: almacenamiento nativo, diálogos, menús y plugin de Kairo.
- `scripts/context.mjs`: navegación documental de solo lectura.
- `scripts/export-symbols.swift`: generación local de símbolos e icono de la aplicación.
- `tests`: reglas de cierre, dependencias, revisiones, importaciones y documentos con formato.

```sh
npm test
npm run check
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Las comprobaciones visuales y limitaciones de esta entrega se documentan en [docs/VALIDATION.md](docs/VALIDATION.md).

## Empaquetar y publicar

```sh
npm ci
npm test
npm run check
npm run build:package
mkdir -p artifacts
npm run pack:planning
```

El `.tgz` solo incluye JavaScript compilado, declaraciones TypeScript, licencia, documentación y ejemplos. No incluye la aplicación nativa, dependencias de desarrollo, datos personales ni capturas de QA. Instala ese archivo en una carpeta externa para comprobarlo antes de publicar con `npm publish ./artifacts/fsaldivar.dev-planning-0.5.0.tgz --access public`. La cuenta npm debe tener permiso sobre el scope y puede requerir verificación adicional al publicar.
