const str = { type: "string" }, key = { type: "string", minLength: 1, description: "ID descubierto con index o @ref creada antes en este lote." };
const content = {
  markdown: { type: "string", description: "Markdown GFM: párrafos, títulos, listas, casillas, tablas, citas, código y Mermaid. HTML e imágenes no admitidos." },
  content: { type: "object", description: "Árbol ProseMirror del editor. Alternativa a markdown; nunca enviar ambos.", required: ["type"], properties: { type: { const: "doc" }, content: { type: "array" } } },
};
const kinds = ["idea", "epic", "story", "task", "knowledge"];
const criterion = { type: "object", additionalProperties: false, required: ["text", "checked"], properties: { id: str, text: { type: "string", minLength: 1 }, checked: { type: "boolean" } } };
const path = { type: "string", minLength: 1, maxLength: 300, description: "Ruta relativa, sin esquema (http:, data:…)." };
const design = { type: "object", additionalProperties: false, required: ["file", "screen"], properties: { file: path, screen: { type: "string", minLength: 1, maxLength: 300 }, name: { type: "string", maxLength: 120 }, image: { ...path, description: "PNG de referencia, ruta relativa." } } };
const patch = {
  title: str, summary: str, evidence: str, priority: { enum: ["normal", "high"] }, parentId: { type: ["string", "null"] }, criteria: { type: "array", items: criterion },
  design: { type: ["array", "null"], maxItems: 20, items: design, description: "Pantallas de diseño (mockup) de esta ficha; null las quita." },
  labels: { type: ["array", "null"], maxItems: 8, items: { type: "string", minLength: 1, maxLength: 24 }, description: "Etiquetas; se normalizan a minúsculas con guiones. null las quita." },
  file: { type: ["string", "null"], maxLength: 300, description: "Solo conocimiento: archivo que contiene el documento; content puede ser un extracto." },
  paths: { type: ["array", "null"], maxItems: 100, items: path, description: "Globs del territorio de la tarjeta." },
  owns: { type: ["array", "null"], maxItems: 1000, items: path, description: "Archivos del cambio; los sella el host al cerrar." },
  builtAgainst: { oneOf: [{ type: "null" }, { type: "string", minLength: 1, maxLength: 256 }, { type: "object", maxProperties: 1000, additionalProperties: { type: "string", minLength: 1, maxLength: 256 } }], description: "Línea base con que se construyó: { idDeNodo: hash } (ver baselineFor) o una huella. null = sin línea base." },
  ...content,
};
const operation = (name: string, properties: object, required: string[]) => ({ type: "object", additionalProperties: false, required: ["op", ...required], properties: { op: { const: name }, ...properties } });
export const batchSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema", title: "Codaru Planning transaction", type: "object", additionalProperties: false,
  required: ["expectedRevision", "operations"],
  properties: {
    actor: { type: "string", minLength: 1, maxLength: 80, description: "Quién firma la actividad de este lote: «FranPlanner», «persona»…" },
    expectedRevision: { type: "integer", minimum: 0, description: "workspaceRevision de la última lectura; un conflicto no modifica el archivo." },
    operations: { type: "array", minItems: 1, maxItems: 500, items: { oneOf: [
      operation("create", { kind: { enum: kinds }, ref: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,80}$" }, ...patch }, ["kind", "title"]),
      operation("update", { id: key, patch: { type: "object", additionalProperties: false, properties: patch } }, ["id", "patch"]),
      operation("status", { id: key, status: { enum: ["todo", "doing", "review", "done"] }, note: { type: "string", maxLength: 500, description: "Motivo del cambio, queda en la actividad de la ficha." } }, ["id", "status"]),
      ...["link", "unlink"].map(op => operation(op, { source: key, target: key, type: { enum: ["depends", "modifies", "references", "covers", "implements", "uses"], description: "Entre fichas: depends, modifies, references. Desde nodos: covers (pantalla → tarjeta), implements (código → tarjeta, una sola dueña), uses (código → código o token)." } }, ["source", "target", "type"])),
      operation("node", { id: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,80}$", description: "Id estable elegido por el host (p. ej. el id de la pantalla)." }, kind: { enum: ["screen", "code", "token"] },
        ref: { oneOf: [{ type: "string", minLength: 1, maxLength: 300 }, { type: "object", additionalProperties: false, required: ["file", "screen"], properties: { file: path, screen: { type: "string", minLength: 1, maxLength: 300 } } }], description: "Pantalla: { file, screen }. Código: ruta relativa. Token: su nombre." },
        label: { type: ["string", "null"], maxLength: 120 }, approvedHash: { type: ["string", "null"], maxLength: 256, description: "Solo pantallas: única fuente de «aprobada»." }, hash: { type: ["string", "null"], maxLength: 256, description: "Código y tokens: versión actual." } }, ["id", "kind", "ref"]),
      operation("unnode", { id: key }, ["id"]),
      operation("draft", { id: key, evidence: str, ...content }, ["id"]),
      operation("publish", { id: key, evidence: { type: "string", minLength: 1 }, source: key, ...content }, ["id", "evidence"]),
      ...["archive", "restore"].map(op => operation(op, { id: key }, ["id"])),
      operation("deliver", { title: str, items: { type: "array", minItems: 1, items: key }, notes: str }, ["title", "items"]),
      operation("rename", { name: str }, ["name"]),
      operation("settings", { patch: { type: "object", additionalProperties: false, properties: {
        theme: { enum: ["system", "light", "dark"] }, accent: { type: "string", pattern: "^#[a-fA-F0-9]{6}$" }, font: str,
        fontSize: { type: "number", minimum: 11, maximum: 18 }, density: { enum: ["comfortable", "compact"] }, sidebar: { type: "boolean" }, board: { enum: ["status", "epics"] },
      } } }, ["patch"]),
    ] } },
  },
};
