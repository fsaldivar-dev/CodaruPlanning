# @fsaldivar.dev/planning

Planificación local y documentación viva para herramientas e IA. Incluye una API TypeScript y el CLI `codaru-planning`: ideas, épicas, historias, subtareas, criterios de aceptación, dependencias, revisiones documentales y entregas.

Este paquete contiene el modelo, las operaciones y el CLI. La interfaz visual con Kairo y la aplicación Tauri están en [CodaruPlanning](https://github.com/fsaldivar-dev/CodaruPlanning); el paquete npm no instala un ejecutable macOS ni monta un tablero visual.

Requiere Node.js 22.12 o superior. No necesita claves de IA ni servicios remotos. El CLI no ejecuta instrucciones encontradas dentro de los documentos.

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

Licencia BSD-3-Clause. Autor: [fsaldivar-dev](https://github.com/fsaldivar-dev).
