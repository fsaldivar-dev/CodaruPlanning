import {
  createItem, addRelation, setStatus, reviseKnowledge, markAffected, descendants,
  completionIssues, defaultSettings, id, type Workspace, type RichNode, type Kind,
  type Status, type Relation, type Criterion, type Settings,
} from "../../planning-core/src/index.js";
import { fromMarkdown, validateDocument, validateDocuments } from "./documents.js";

export type ContentInput = { markdown?: string; content?: RichNode };
export type ItemPatch = ContentInput & { title?: string; summary?: string; evidence?: string; priority?: "normal" | "high"; parentId?: string | null; criteria?: (Omit<Criterion, "id"> & { id?: string })[] };
export type Operation =
  | ({ op: "create"; ref?: string; kind: Kind; title: string } & Omit<ItemPatch, "title">)
  | { op: "update"; id: string; patch: ItemPatch }
  | { op: "status"; id: string; status: Status }
  | { op: "link" | "unlink"; source: string; target: string; type: Relation["type"] }
  | ({ op: "draft"; id: string; evidence?: string } & ContentInput)
  | ({ op: "publish"; id: string; evidence: string; source?: string } & ContentInput)
  | { op: "archive" | "restore"; id: string }
  | { op: "deliver"; title: string; items: string[]; notes?: string }
  | { op: "settings"; patch: Partial<Settings> }
  | { op: "rename"; name: string };
export type Batch = { expectedRevision: number; operations: Operation[] };
export type ApplyResult = { workspace: Workspace; refs: Record<string, string>; affectedIds: string[] };

export function emptyWorkspace(name = "Mi espacio"): Workspace {
  if (!name.trim()) throw new Error("Escribe un nombre para el espacio.");
  return { schemaVersion: 1, revision: 0, name: name.trim(), items: [], relations: [], deliveries: [], settings: { ...defaultSettings }, exampleDismissed: true };
}
const has = (object: object, key: string) => Object.hasOwn(object, key);
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Se esperaba un objeto JSON.");
  const unexpected = Object.keys(value).filter(key => !keys.includes(key));
  if (unexpected.length) throw new Error(`Campos desconocidos: ${unexpected.join(", ")}. Consulta schema.`);
}
function text(value: unknown, name: string, required = false): asserts value is string {
  if (typeof value !== "string" || (required && !value.trim())) throw new Error(`${name}: texto ${required ? "no vacío " : ""}requerido.`);
}
function content(input: ContentInput): RichNode | undefined {
  if (has(input, "content") && has(input, "markdown")) throw new Error("Usa content o markdown, no ambos.");
  if (has(input, "markdown")) return fromMarkdown(input.markdown!);
  if (has(input, "content")) return validateDocument(input.content!);
}
const patchKeys = ["title", "summary", "evidence", "priority", "parentId", "criteria", "content", "markdown"];

/** Clone first: failed operations never partly modify the caller's workspace. */
export function applyOperations(original: Workspace, batch: Batch): ApplyResult {
  validateDocuments(original);
  exact(batch, ["expectedRevision", "operations"]);
  if (!Number.isSafeInteger(batch.expectedRevision) || batch.expectedRevision !== original.revision)
    throw new Error(`Conflicto de revisión: se esperaba ${batch.expectedRevision}, actual ${original.revision}. Vuelve a leer antes de escribir.`);
  if (!Array.isArray(batch.operations) || batch.operations.length < 1 || batch.operations.length > 500) throw new Error("Envía entre 1 y 500 operaciones.");
  const ws = structuredClone(original), refs: Record<string, string> = Object.create(null), affected = new Set<string>();
  const resolve = (key: string): string => {
    text(key, "id", true);
    if (key.startsWith("@")) {
      if (!has(refs, key.slice(1))) throw new Error(`Referencia no creada: ${key}.`);
      return refs[key.slice(1)];
    }
    return key;
  };
  const get = (key: string) => {
    const item = ws.items.find(item => item.id === resolve(key));
    if (!item) throw new Error(`Ficha inexistente: ${key}.`);
    return item;
  };
  const touch = (key: string, invalidate = true) => {
    const item = get(key); item.updatedAt = new Date().toISOString(); affected.add(item.id);
    if (invalidate && item.kind !== "knowledge") markAffected(ws, item.id);
  };
  const patchItem = (key: string, patch: ItemPatch, creating = false) => {
    exact(patch, patchKeys);
    const item = get(key);
    if (item.archived) throw new Error("Restaura la ficha antes de editarla.");
    if (!creating && item.kind === "knowledge" && (has(patch, "content") || has(patch, "markdown") || has(patch, "evidence"))) throw new Error("Usa draft y publish para conservar las revisiones de conocimiento.");
    for (const field of ["title", "summary", "evidence"] as const) if (has(patch, field)) { text(patch[field], field, field === "title"); item[field] = patch[field]!; }
    if (has(patch, "priority")) {
      if (!["normal", "high"].includes(patch.priority!)) throw new Error("Prioridad inválida.");
      item.priority = patch.priority!;
    }
    if (has(patch, "parentId")) {
      if (patch.parentId === null) item.parentId = undefined;
      else {
        const parent = get(patch.parentId!);
        if (parent.archived || parent.id === item.id || (item.kind === "story" ? parent.kind !== "epic" : item.kind === "task" ? !["story", "task"].includes(parent.kind) : true)) throw new Error("Jerarquía inválida: épica → historia → subtarea.");
        item.parentId = parent.id;
      }
    }
    if (has(patch, "criteria")) {
      if (!Array.isArray(patch.criteria)) throw new Error("criteria debe ser una lista.");
      item.criteria = patch.criteria.map(c => {
        exact(c, ["id", "text", "checked"]); text(c.text, "criterion.text", true);
        if (typeof c.checked !== "boolean") throw new Error("criterion.checked debe ser booleano.");
        return { id: c.id ?? id(), text: c.text, checked: c.checked };
      });
    }
    const body = content(patch); if (body) item.content = body;
    touch(item.id);
  };
  batch.operations.forEach((op, index) => {
    try {
      if (!op || typeof op !== "object") throw new Error("Operación inválida.");
      switch (op.op) {
        case "create": {
          exact(op, ["op", "ref", "kind", ...patchKeys]);
          if (!["idea", "epic", "story", "task", "knowledge"].includes(op.kind)) throw new Error("Tipo de ficha inválido.");
          text(op.title, "title", true);
          if (op.ref !== undefined && (!/^[a-zA-Z0-9_-]{1,80}$/.test(op.ref) || has(refs, op.ref))) throw new Error("Referencia inválida o duplicada.");
          const item = createItem(ws, op.kind, op.title);
          const { op: _, kind: __, ref, ...patch } = op;
          if (ref) refs[ref] = item.id;
          patchItem(item.id, patch, true); break;
        }
        case "update": exact(op, ["op", "id", "patch"]); patchItem(op.id, op.patch); break;
        case "status": {
          exact(op, ["op", "id", "status"]);
          if (!["todo", "doing", "review", "done"].includes(op.status)) throw new Error("Estado inválido.");
          const item = get(op.id); if (item.archived) throw new Error("Restaura la ficha primero.");
          setStatus(ws, item, op.status); touch(item.id, false); break;
        }
        case "link": case "unlink": {
          exact(op, ["op", "source", "target", "type"]);
          if (!["depends", "modifies", "references"].includes(op.type)) throw new Error("Tipo de relación inválido.");
          const source = get(op.source), target = get(op.target);
          if (op.op === "link") {
            if (source.archived || target.archived) throw new Error("Restaura las fichas antes de vincularlas.");
            addRelation(ws, source.id, target.id, op.type);
          } else ws.relations = ws.relations.filter(r => !(r.source === source.id && r.target === target.id && r.type === op.type));
          touch(source.id, false); touch(target.id, false); break;
        }
        case "draft": case "publish": {
          exact(op, ["op", "id", "evidence", "content", "markdown", ...(op.op === "publish" ? ["source"] : [])]);
          const item = get(op.id);
          if (item.kind !== "knowledge" || item.archived) throw new Error("Se requiere una ficha de conocimiento activa.");
          const body = content(op);
          if (op.evidence !== undefined) text(op.evidence, "evidence");
          if (op.op === "draft") {
            if (!body) throw new Error("El borrador necesita markdown o content.");
            item.pendingChange = body; item.pendingEvidence = op.evidence;
            item.freshness = item.freshness === "draft" ? "draft" : "review";
          } else {
            text(op.evidence, "evidence", true);
            reviseKnowledge(item, body || item.pendingChange || item.content, op.evidence, op.source ? get(op.source).id : undefined);
          }
          touch(item.id, false); break;
        }
        case "archive": case "restore": {
          exact(op, ["op", "id"]); const item = get(op.id);
          if (op.op === "archive") for (const entry of [item, ...descendants(ws, item.id)]) { entry.archived = true; touch(entry.id, false); }
          else {
            if (item.parentId && get(item.parentId).archived) throw new Error("Restaura primero el padre.");
            item.archived = false; touch(item.id, false);
          }
          break;
        }
        case "deliver": {
          exact(op, ["op", "title", "items", "notes"]); text(op.title, "title", true);
          if (op.notes !== undefined) text(op.notes, "notes");
          if (!Array.isArray(op.items) || !op.items.length) throw new Error("Selecciona trabajo terminado para entregar.");
          const items = [...new Set(op.items.map(key => get(key).id))].map(get);
          for (const item of items) {
            if (item.archived || item.kind === "knowledge" || item.status !== "done") throw new Error("La entrega requiere trabajo activo y terminado.");
            const issues = completionIssues(ws, item); if (issues.length) throw new Error(issues.join(" "));
          }
          const docs = new Set(ws.relations.filter(r => r.type === "modifies" && items.some(i => i.id === r.source)).map(r => r.target));
          ws.deliveries.unshift({ id: id(), title: op.title, at: new Date().toISOString(), items: items.map(i => i.id), documents: [...docs].map(key => ({ id: key, revision: get(key).revision })), notes: op.notes || "" }); break;
        }
        case "settings": exact(op, ["op", "patch"]); exact(op.patch, Object.keys(defaultSettings)); Object.assign(ws.settings, op.patch); break;
        case "rename": exact(op, ["op", "name"]); text(op.name, "name", true); ws.name = op.name.trim(); break;
        default: throw new Error(`Operación desconocida: ${(op as { op: string }).op}.`);
      }
    } catch (error) { throw new Error(`Operación ${index + 1}: ${error instanceof Error ? error.message : error}`); }
  });
  // Later operations must not invalidate work marked complete earlier in the batch.
  for (const item of ws.items) if (!item.archived && item.status === "done") {
    const before = original.items.find(i => i.id === item.id);
    const previousIssues = before?.status === "done" ? completionIssues(original, before) : [];
    const issues = completionIssues(ws, item);
    if (issues.length && (affected.has(item.id) || !before || before.status !== "done" || issues.some(issue => !previousIssues.includes(issue))))
      throw new Error(`${item.title}: ${issues.join(" ")} Reabre el trabajo antes de modificarlo.`);
  }
  validateDocuments(ws);
  return { workspace: ws, refs, affectedIds: [...affected] };
}
