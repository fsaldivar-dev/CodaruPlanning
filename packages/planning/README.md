# @fsaldivar.dev/planning

Planificación local y documentación viva para herramientas e IA. Incluye una API TypeScript y el CLI `codaru-planning`: ideas, épicas, historias, subtareas, criterios de aceptación, dependencias, revisiones documentales y entregas.

Este paquete contiene el modelo, las operaciones, el CLI y, desde la versión 0.2.0, la interfaz como piezas independientes: el editor por bloques con Kairo y cada zona de la aplicación de escritorio (barra lateral, barra de ventana, tablero, pestañas, propiedades, relaciones, criterios, listas). Son el mismo marcado y los mismos estilos que usa la aplicación. Cada pieza se monta por separado en tu propia aplicación y hereda su apariencia; consulta [Componentes de interfaz](#componentes-de-interfaz). La aplicación Tauri completa está en [CodaruPlanning](https://github.com/fsaldivar-dev/CodaruPlanning); el paquete npm no instala un ejecutable macOS.

El CLI y la API de dominio requieren Node.js 22.12 o superior. No necesitan claves de IA ni servicios remotos. El CLI no ejecuta instrucciones encontradas dentro de los documentos.

## Instalar

```sh
npm install @fsaldivar.dev/planning
npx @fsaldivar.dev/planning --help
```

También puedes instalarlo globalmente: `npm install -g @fsaldivar.dev/planning`.

## Leer contexto sin cargar el espacio completo

```sh
codaru-planning path
codaru-planning index --limit 20
codaru-planning search "autenticación"
codaru-planning neighbors ID
codaru-planning read ID "Cómo funciona"
codaru-planning export ID
codaru-planning schema
```

Por defecto lee el espacio de la aplicación de escritorio. Para otro espacio, añade `--workspace /ruta/workspace.json`. `index` y `search` devuelven `workspaceRevision`, IDs, resúmenes, secciones y paginación (`--limit`, `--offset`, `nextOffset`). `read` devuelve Markdown; `--format markdown` imprime solo el documento. Los borradores de conocimiento se señalan, pero no se presentan como contenido verificado.

## Escribir desde una IA

Toda escritura requiere `--workspace` explícito. Para comenzar en un espacio independiente:

```sh
codaru-planning init --workspace .codaru/workspace.json --name "Mi producto"
codaru-planning apply --workspace .codaru/workspace.json --file cambios.json --dry-run
codaru-planning apply --workspace .codaru/workspace.json --file cambios.json
```

`cambios.json`, para un espacio recién creado con revisión 1:

```json
{
  "expectedRevision": 1,
  "operations": [
    { "op": "create", "ref": "epic", "kind": "epic", "title": "Primera entrega" },
    {
      "op": "create", "ref": "story", "kind": "story", "parentId": "@epic",
      "title": "Acceso al producto",
      "markdown": "## Qué queremos lograr\nPermitir el acceso.\n\n## Cómo lo vamos a resolver\nValidar las credenciales.\n\n```mermaid\nflowchart LR\n A[Entrada] --> B[Validación]\n```",
      "criteria": [{ "text": "Rechaza credenciales incorrectas", "checked": false }]
    },
    { "op": "create", "ref": "doc", "kind": "knowledge", "title": "Autenticación", "markdown": "## Qué hace\nControla el acceso.\n\n## Cómo funciona\nPendiente de verificar." },
    { "op": "link", "source": "@story", "target": "@doc", "type": "modifies" }
  ]
}
```

La salida devuelve los IDs asignados a `refs`, las fichas afectadas y la nueva revisión. Las referencias `@nombre` solo existen dentro del lote; usa los IDs devueltos en llamadas posteriores. `--file -` lee JSON de stdin. `--dry-run` valida sin escribir; sus IDs son provisionales.

| Operación | Campos principales |
| --- | --- |
| `create` | `kind`, `title`, `ref` opcional, `parentId`, `summary`, `markdown` o `content`, `criteria` |
| `update` | `id`, `patch`: título, resumen, prioridad, padre, criterios, evidencia o contenido de trabajo |
| `status` | `id`, `status`: `todo`, `doing`, `review`, `done` |
| `link`, `unlink` | `source`, `target`, `type`: `depends`, `modifies`, `references` |
| `draft` | `id` de conocimiento, `markdown` o `content`, `evidence` opcional |
| `publish` | `id` de conocimiento, `evidence`, contenido opcional; publica el borrador pendiente si existe |
| `archive`, `restore` | `id`; archivar incluye descendientes, restaurar requiere el padre activo |
| `deliver` | `title`, `items` terminados, `notes` opcional |
| `rename`, `settings` | `name` o `patch` de preferencias |

`schema` devuelve el contrato JSON completo. Markdown admite párrafos, títulos, listas, casillas, tablas, citas, separadores, enlaces, énfasis y bloques de código, incluidos `mermaid`. HTML arbitrario, imágenes y tachado se rechazan porque no están representados por el editor actual. También se admite el árbol `content` de ProseMirror, validado con el mismo esquema del editor. No se envían `markdown` y `content` juntos.

El CLI escribe Mermaid dentro de los bloques documentales; Kairo lo previsualiza y permite editarlo en la app. La creación de documentos Kairo independientes de esos bloques no forma parte de esta versión del CLI.

## Reglas y concurrencia

- `expectedRevision` debe coincidir con la última lectura. Un conflicto requiere volver a leer y revisar el lote; no se reintenta silenciosamente.
- El lote se valida completo antes de guardar. Un fallo no deja cambios parciales en el espacio.
- Las dependencias circulares se rechazan. Para terminar trabajo se requieren criterios, evidencia, hijos y dependencias resueltos, y documentación vigente.
- Editar trabajo marca su documentación vinculada para revisión. Publica la documentación después del último cambio del trabajo.
- `publish` exige evidencia y conserva la revisión anterior. Escribir conocimiento mediante `update` no puede saltarse ese historial.
- El guardado usa bloqueo compartido con Tauri, reemplazo atómico y una copia anterior. Los archivos `context/` son exportaciones reconstruibles; el archivo canónico es `workspace.json`.
- Usa una compilación de escritorio compatible con este CLI, incluida en este repositorio. Cierra las compilaciones anteriores antes de escribir desde el CLI. La app actualiza el contenido cuando está inactiva y no tiene cambios pendientes ni un diálogo abierto; un conflicto conserva los cambios locales y pide exportarlos antes de recargar.
- Si un proceso termina de forma abrupta puede quedar un directorio vacío `workspace.json.write-lock`. No se elimina por antigüedad: verifica que no haya escritores activos antes de retirarlo.
- Límite actual: 24 MiB por espacio y 500 operaciones por lote. Archivar conserva los datos; no es borrado permanente.

## API para otro sistema

```ts
import { emptyWorkspace, applyOperations } from '@fsaldivar.dev/planning';

const original = emptyWorkspace('Mi producto');
const result = applyOperations(original, {
  expectedRevision: 0,
  operations: [{ op: 'create', kind: 'idea', title: 'Una nueva idea', ref: 'idea' }],
});
console.log(result.refs.idea, result.workspace);
```

`applyOperations` es una transformación pura: clona y valida sin mutar `original` ni incrementar la revisión de almacenamiento. En Node usa `initializeWorkspace`, `readWorkspace` y `applyToFile` desde `@fsaldivar.dev/planning/node` para persistir con bloqueo, respaldo e incremento de revisión. Otro host debe mantener el mismo control de concurrencia.

## Componentes de interfaz

Las piezas visuales se importan por separado y no dependen de la aplicación Tauri, de una ventana ni de un sistema de guardado. El host conserva los datos y decide qué monta.

| Entrada | Contenido |
| --- | --- |
| `@fsaldivar.dev/planning/editor` | `createBlockEditor`, `VisualEditor`, `schema`, `blockTypes` |
| `@fsaldivar.dev/planning/editor/commands` | Comandos ProseMirror de bloques: `changeBlock`, `moveBlock`, `duplicateBlock`, `deleteBlock`, `createTable` |
| `@fsaldivar.dev/planning/components` | Cada zona de la aplicación como pieza independiente: `mountSidebar`, `mountBoard`, `mountProperties`… y su marcado (`sidebarMarkup`…) |
| `@fsaldivar.dev/planning/mermaid` | `mountMermaidPreview`, `openMermaidDesigner`, `parseMermaidPreview`, `applyMermaidEdit` |
| `@fsaldivar.dev/planning/navigation` | `bindNavigation`, `zoomFromWheel`, `zoomActiveSurface` |
| `@fsaldivar.dev/planning/markdown` | `fromMarkdown`, `markdown`, `plain`, `validateDocument`, sin interfaz |
| `@fsaldivar.dev/planning/editor.css`, `/components.css` | Estilos de cada grupo |

El editor necesita estas dependencias en el host; el CLI y la API de dominio no las cargan:

```sh
npm install @fsaldivar.dev/planning prosemirror-state prosemirror-view prosemirror-commands prosemirror-history prosemirror-keymap highlight.js @fsaldivar.dev/diagram
```

`highlight.js` colorea los bloques de código y `@fsaldivar.dev/diagram` (Kairo) dibuja y edita los diagramas Mermaid. `components` no necesita ninguna de ellas, solo su hoja de estilos.

### Editor por bloques

```ts
import { createBlockEditor } from '@fsaldivar.dev/planning/editor';
import '@fsaldivar.dev/planning/editor.css';

const editor = createBlockEditor(document.getElementById('editor')!, {
  markdown: '## Hola\n\nEscribe / para insertar un bloque.',
  toolbar: false,                                   // tus propios controles
  tableToolbar: document.getElementById('tabla')!,  // o monta los incluidos donde quieras
  footer: false,
  onChange(content) { /* guarda el árbol en tu almacenamiento */ },
});

negrita.onclick = () => editor.execute('bold');
tabla.onclick = () => editor.insertBlock('table');
editor.subscribe(state => { negrita.disabled = !editor.can('bold'); });
```

- **Contenido inicial**: `content` (árbol ProseMirror) o `markdown`.
- **Controles**: `toolbar`, `tableToolbar` y `footer` aceptan `false` para ocultarlos o un elemento para montarlos fuera del documento. `blockGutter: false` oculta el asa lateral.
- **Comandos**: `execute` y `can` aceptan `bold`, `italic`, `inline-code`, `undo`, `redo`, `row`, `column`, `delete-row`, `delete-column`, `delete-table` y `header`.
- **Bloques**: `insertBlock` acepta `paragraph`, `h1`, `h2`, `h3`, `blockquote`, `horizontal_rule`, `bullet_list`, `ordered_list`, `task_list`, `table`, `mermaid` y `code_block`. `openBlockMenu(ancla)` abre el menú junto a tu botón.
- **Lectura y escritura**: `getJSON`, `getMarkdown`, `setContent`, `setMarkdown`. Reemplazar el documento reinicia el historial de deshacer y no emite `onChange` salvo con `{ emit: true }`.
- **Estado**: `getState` y `subscribe` entregan `readOnly`, `canUndo`, `canRedo`, `inTable`, `bold`, `italic`, `inlineCode`, `words`, `characters` y `zoom`.
- **Otros**: `readOnly`, `placeholder`, `label`, `setZoom`, `focus` y `destroy`.

Cada editor mantiene su propio estado; puedes montar varios en la misma página.

### Piezas de la aplicación

La aplicación de escritorio se construye con estas mismas piezas, así que se ven y se comportan igual. Ninguna depende de otra: monta solo las que necesites, en el contenedor que quieras.

| Pieza | Qué muestra | Intenciones |
| --- | --- | --- |
| `mountWindowToolbar` | Nombre del espacio, subtítulo, buscador, nueva tarjeta, configuración | `onSearch`, `onNew`, `onSettings`, `onToggleSidebar` |
| `mountSidebar` | Vistas, épicas, borrador y estado de guardado | `onView`, `onFilterEpic`, `onOpen`, `onNewEpic`, `onDraft`, `onRecover` |
| `mountViewToolbar` | Título de la vista, Estados/Épicas, menú «Nueva tarjeta» | `onBoardMode`, `onCreate` |
| `mountBoard` | Tablero con filtro por épica, columnas y arrastre | `onOpen`, `onCreate`, `onStatusChange`, `onEpicFilter`, `onDismissWelcome` |
| `mountCard` | Una tarjeta | `onOpen` |
| `mountKnowledgeList`, `mountDeliveries`, `mountArchive` | Listas de conocimiento, entregas y archivo | `onOpen`, `onCreate`, `onRestore` |
| `mountItemHeader` | Volver, archivar, título y resumen | `onBack`, `onArchive`, `onTitle`, `onSummary` |
| `mountDetailTabs` | Contenido, Subtareas, Contexto, Diagrama, Historial | `onTab` |
| `mountProperties` | Tipo, estado, prioridad, padre, fecha y relaciones | `onStatus`, `onPriority`, `onParent`, `onRestore`, `onOpen`, `onLink`, `onUnlink` |
| `mountRelations` | Relaciones de una ficha | `onOpen`, `onLink`, `onUnlink` |
| `mountCriteria` | Criterios de aceptación | `onToggle`, `onEdit`, `onRemove`, `onAdd` |
| `mountEvidence` | Resultado y verificación | `onChange`, `onPublish` |
| `mountSubtasks`, `mountContext`, `mountHistory`, `mountDocumentState` | Subtareas, contexto para IA, revisiones y estado del documento | `onOpen`, `onCreate`, `onCopy`, `onExport`, `onOpenRevision` |

```ts
import { mountSidebar, mountProperties } from '@fsaldivar.dev/planning/components';
import '@fsaldivar.dev/planning/components.css';

const sidebar = mountSidebar(document.getElementById('mi-panel')!, {
  workspace, view: 'board',
  onView(view) { /* navega en tu aplicación */ sidebar.update({ view }); },
});
const properties = mountProperties(document.getElementById('mi-inspector')!, {
  workspace, item,
  relations: false, // las relaciones van en otro sitio con mountRelations
  onStatus(status) { /* aplica { op: 'status', id: item.id, status } y llama a properties.update */ },
});
```

- **Controladas**: las piezas no modifican el espacio. Emiten la intención; el host aplica el cambio con `applyOperations` y llama a `update` con los datos nuevos. Un selector o una casilla vuelve a su valor anterior hasta que el host confirma.
- **Opcionales por control**: un control sin su callback se oculta o queda de solo lectura. Sin `onSearch` no hay buscador; sin `onLink` no hay botón «Vincular».
- **`update(parcial)`** acepta solo lo que cambió y conserva el cursor si se está escribiendo. `destroy()` retira la pieza.
- **`className`** añade tus clases al contenedor de la pieza; **`icon`** sustituye los iconos.
- **Diálogos**: crear tarjeta, vincular y configuración pertenecen al host; las piezas solo avisan (`onNew`, `onLink`, `onSettings`).
- **Marcado**: cada pieza tiene su función `…Markup` (`sidebarMarkup`, `propertiesMarkup`, `boardViewMarkup`…) por si prefieres componer el HTML y delegar los eventos tú mismo, como hace la aplicación de escritorio.

La disposición es tuya: las piezas no fijan su posición en la página. La barra lateral y las propiedades traen su ancho de la aplicación (208 px y 238 px); cámbialo con CSS sobre `.sidebar` o `.inspector`.

### Apariencia

Los estilos se limitan al contenedor `.codaru-planning` que crea cada pieza y nunca tocan `body` ni `:root`. Sin configurar nada se ven como la aplicación de escritorio. Para el tema oscuro de la aplicación, pon `data-theme="dark"` en cualquier ancestro. Para tu propio tema, define las variables en cualquier ancestro; cada instancia puede tener el suyo:

```css
#mi-ide {
  --planning-accent: #7563c4;
  --planning-surface: #202024;
  --planning-text: #eeeef4;
  --planning-color-scheme: dark;
}
```

| Variable | Uso |
| --- | --- |
| `--planning-accent`, `--planning-accent-ink` | Color de acento y texto sobre el acento |
| `--planning-surface`, `--planning-background` | Fondo del contenido y de los paneles |
| `--planning-sidebar`, `--planning-toolbar`, `--planning-field` | Fondo de la barra lateral, de la barra de ventana y de los campos |
| `--planning-success`, `--planning-warning`, `--planning-shadow` | Estados «vigente» y «por revisar», y sombra de tarjetas y botones |
| `--planning-text`, `--planning-muted` | Texto principal y secundario |
| `--planning-border`, `--planning-divider` | Bordes y separadores |
| `--planning-hover`, `--planning-selection` | Estados al pasar el cursor y de selección |
| `--planning-font`, `--planning-font-size`, `--planning-document-font-size` | Tipografía y tamaño base (todas las piezas escalan con él) y tamaño del documento |
| `--planning-gutter-width` | Ancho del asa lateral de bloques |
| `--planning-code-keyword`, `--planning-code-title`, `--planning-code-string`, `--planning-code-number` | Colores del código |
| `--planning-color-scheme` | `light` o `dark` para los controles nativos |

Para usar tus propios iconos, pasa `icon: nombre => '<svg…>'` al editor o a cualquier pieza; `iconNames` lista los nombres que se piden. El resultado se inserta como HTML de confianza: no interpoles en él texto del documento ni del usuario.

`examples/composable-ui` reconstruye la pantalla de la aplicación montando cada pieza en un contenedor del host, con tema claro y oscuro, otro acento y las propiedades cambiadas de lado. Usa únicamente el paquete instalado.

Licencia BSD-3-Clause. Autor: [fsaldivar-dev](https://github.com/fsaldivar-dev).
