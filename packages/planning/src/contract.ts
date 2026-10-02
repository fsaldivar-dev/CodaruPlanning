const str = { type: "string" }, key = { type: "string", minLength: 1, description: "ID descubierto con index o @ref creada antes en este lote." };
const content = {
  markdown: { type: "string", description: "Markdown GFM: párrafos, títulos, listas, casillas, tablas, citas, código y Mermaid. HTML e imágenes no admitidos." },
  content: { type: "object", description: "Árbol ProseMirror del editor. Alternativa a markdown; nunca enviar ambos.", required: ["type"], properties: { type: { const: "doc" }, content: { type: "array" } } },
};
const kinds = ["idea", "epic", "story", "task", "knowledge"];
const criterion = { type: "object", additionalProperties: false, required: ["text", "checked"], properties: { id: str, text: { type: "string", minLength: 1 }, checked: { type: "boolean" } } };
const patch = { title: str, summary: str, evidence: str, priority: { enum: ["normal", "high"] }, parentId: { type: ["string", "null"] }, criteria: { type: "array", items: criterion }, ...content };
const operation = (name: string, properties: object, required: string[]) => ({ type: "object", additionalProperties: false, required: ["op", ...required], properties: { op: { const: name }, ...properties } });
export const batchSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema", title: "Codaru Planning transaction", type: "object", additionalProperties: false,
  required: ["expectedRevision", "operations"],
  properties: {
    expectedRevision: { type: "integer", minimum: 0, description: "workspaceRevision de la última lectura; un conflicto no modifica el archivo." },
    operations: { type: "array", minItems: 1, maxItems: 500, items: { oneOf: [
      operation("create", { kind: { enum: kinds }, ref: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,80}$" }, ...patch }, ["kind", "title"]),
      operation("update", { id: key, patch: { type: "object", additionalProperties: false, properties: patch } }, ["id", "patch"]),
      operation("status", { id: key, status: { enum: ["todo", "doing", "review", "done"] } }, ["id", "status"]),
      ...["link", "unlink"].map(op => operation(op, { source: key, target: key, type: { enum: ["depends", "modifies", "references"] } }, ["source", "target", "type"])),
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
