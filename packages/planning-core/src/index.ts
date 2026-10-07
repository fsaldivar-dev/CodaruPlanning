export type Kind = "idea" | "epic" | "story" | "task" | "knowledge";
export type Status = "todo" | "doing" | "review" | "done";
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};
/** Between items: depends, modifies, references. From nodes: covers (screen to card), implements (code to card, one owner), uses (code to code or token). */
export type Relation = {
  id: string;
  source: string;
  target: string;
  type: "depends" | "modifies" | "references" | "covers" | "implements" | "uses";
};
export const itemRelationTypes = ["depends", "modifies", "references"] as const;
export const nodeRelationTypes = ["covers", "implements", "uses"] as const;
export type NodeKind = "screen" | "code" | "token";
/** Something outside the board that cards are built from: a mockup screen, a source file, a design token. */
export type PlanNode = {
  /** Stable id chosen by the host, e.g. the screen id of the design file. Never shared with an item. */
  id: string;
  kind: NodeKind;
  /** Screen: { file, screen }. Code: relative path. Token: its name, e.g. --codaru-accent. */
  ref: string | { file: string; screen: string };
  label?: string;
  /** Screens only. The single source of truth for "approved". */
  approvedHash?: string;
  /** Code and tokens: current version, compared with the baseline cards were built against. */
  hash?: string;
};
/** What a card was built against: node id to hash at that moment, or an opaque fingerprint (baselineFingerprint). null = no baseline. */
export type Baseline = string | null | Record<string, string>;
export type Criterion = { id: string; text: string; checked: boolean };
/** A screen of a design file (mockup). `image` is a relative path to a reference PNG. */
export type DesignRef = { file: string; screen: string; name?: string; image?: string };
/** One change on an item, for auditing who moved what and why. */
export type ActivityEntry = { at: string; op: string; actor?: string; note?: string; from?: string; to?: string; fields?: string[] };
export const activityLimit = 200;
export const territoryLimits = { paths: 100, owns: 1000, path: 300, hash: 256, baseline: 1000, nodes: 5000 };
export const labelLimits = { perItem: 8, length: 24 };
export const designLimits = { perItem: 20, path: 300, name: 120 };
export type Revision = {
  revision: number;
  at: string;
  source?: string;
  content: RichNode;
  summary: string;
  evidence?: string;
};
export type Item = {
  id: string;
  kind: Kind;
  title: string;
  summary: string;
  content: RichNode;
  status: Status;
  parentId?: string;
  criteria: Criterion[];
  priority: "normal" | "high";
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
  history: Revision[];
  freshness?: "draft" | "current" | "review";
  evidence: string;
  pendingChange?: RichNode;
  pendingEvidence?: string;
  diagram?: unknown;
  design?: DesignRef[];
  labels?: string[];
  activity?: ActivityEntry[];
  /** Knowledge only: the document lives in this file and `content` may be an excerpt. */
  file?: string;
  /** Globs of the card's territory in the codebase. */
  paths?: string[];
  /** Files of the card's change, sealed by the host when it closes. */
  owns?: string[];
  /** Baseline the card was built against. null = no baseline. */
  builtAgainst?: Baseline;
};
export type Settings = {
  theme: "system" | "light" | "dark";
  accent: string;
  font: string;
  fontSize: number;
  density: "comfortable" | "compact";
  sidebar: boolean;
  board: "status" | "epics";
};
export type Delivery = {
  id: string;
  title: string;
  at: string;
  items: string[];
  documents: { id: string; revision: number }[];
  notes: string;
};
export type Workspace = {
  schemaVersion: 1;
  revision: number;
  name: string;
  items: Item[];
  relations: Relation[];
  deliveries: Delivery[];
  settings: Settings;
  draft?: {
    kind: Kind;
    title: string;
    content: RichNode;
    parentId?: string;
    criteria: Criterion[];
  };
  exampleDismissed: boolean;
  /** Screens, code and tokens connected to cards. Absent in older workspaces. */
  nodes?: PlanNode[];
};
export const statuses: [Status, string][] = [
  ["todo", "Por hacer"],
  ["doing", "En curso"],
  ["review", "En revisión"],
  ["done", "Terminado"],
];
export const kindLabels: Record<Kind, string> = {
  idea: "Idea",
  epic: "Épica",
  story: "Historia",
  task: "Subtarea",
  knowledge: "Conocimiento",
};
export const defaultSettings: Settings = {
  theme: "system",
  accent: "#007aff",
  font: "system",
  fontSize: 13,
  density: "comfortable",
  sidebar: true,
  board: "status",
};
export const id = () => crypto.randomUUID();
export const paragraph = (text = ""): RichNode => ({
  type: "paragraph",
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
export const heading = (text: string): RichNode => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});
export const rich = (...nodes: RichNode[]): RichNode => ({
  type: "doc",
  content: nodes.length ? nodes : [paragraph()],
});
export const template = (kind: Kind): RichNode =>
  kind === "idea"
    ? rich(paragraph())
    : kind === "knowledge"
      ? rich(
          heading("Qué hace"),
          paragraph(),
          heading("Cómo funciona"),
          paragraph(),
          heading("Reglas y límites"),
          paragraph(),
        )
      : rich(
          heading("Qué queremos lograr"),
          paragraph(),
          heading("Cómo lo vamos a resolver"),
          paragraph(),
        );
export function plain(node: RichNode): string {
  if (node.type === "hard_break") return "\n";
  return (
    node.text ??
    (node.content || [])
      .map(plain)
      .join(
        node.type === "table_row"
          ? " | "
          : [
                "doc",
                "bullet_list",
                "ordered_list",
                "task_list",
                "task_item",
                "list_item",
                "table",
                "table_cell",
                "table_header",
                "blockquote",
              ].includes(node.type)
            ? "\n"
            : "",
      )
  );
}
export function markdown(node: RichNode): string {
  if (node.type === "text") {
    let text = (node.text || "").replace(/[\\`*_\[\]]/g, "\\$&");
    for (const mark of node.marks || []) {
      if (mark.type === "strong") text = `**${text}**`;
      if (mark.type === "em") text = `*${text}*`;
      if (mark.type === "code") text = "`" + (node.text || "") + "`";
      if (mark.type === "link" && /^https?:\/\//.test(String(mark.attrs?.href)))
        text = `[${text}](${mark.attrs?.href})`;
    }
    return text;
  }
  const children = node.content || [],
    body = children.map(markdown).join("");
  if (node.type === "heading")
    return "#".repeat(Number(node.attrs?.level) || 2) + " " + body + "\n\n";
  if (node.type === "paragraph") return body + "\n\n";
  if (node.type === "hard_break") return "\n";
  if (["bullet_list", "ordered_list", "task_list"].includes(node.type))
    return (
      children
        .map(
          (n, i) =>
            (node.type === "task_list"
              ? `- [${n.attrs?.checked ? "x" : " "}] `
              : node.type === "bullet_list"
                ? "- "
                : `${i + (Number(node.attrs?.order) || 1)}. `) +
            markdown(n).trim().replace(/\n/g, "\n    "),
        )
        .join("\n") + "\n\n"
    );
  if (node.type === "blockquote")
    return (
      body
        .trim()
        .split("\n")
        .map((x) => "> " + x)
        .join("\n") + "\n\n"
    );
  if (node.type === "code_block") {
    const source = plain(node);
    const fence = "`".repeat(
      Math.max(
        3,
        ...[...source.matchAll(/`+/g)].map((match) => match[0].length + 1),
      ),
    );
    const language = String(node.attrs?.language || "");
    return (
      fence +
      (language !== "plaintext" && /^[\w+-]+$/.test(language) ? language : "") +
      "\n" +
      source +
      "\n" +
      fence +
      "\n\n"
    );
  }
  if (node.type === "table") {
    const grid: string[][] = [];
    children.forEach((row, rowIndex) => {
      grid[rowIndex] ||= [];
      let column = 0;
      for (const cell of row.content || []) {
        while (grid[rowIndex][column] !== undefined) column++;
        const value = (cell.content || [])
          .map(markdown)
          .join("")
          .trim()
          .replace(/\|/g, "\\|")
          .replace(/\n/g, "<br>");
        const rows = Math.max(1, Number(cell.attrs?.rowspan) || 1),
          columns = Math.max(1, Number(cell.attrs?.colspan) || 1);
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < columns; c++) {
            grid[rowIndex + r] ||= [];
            grid[rowIndex + r][column + c] = r === 0 && c === 0 ? value : "";
          }
        column += columns;
      }
    });
    const width = Math.max(0, ...grid.map((row) => row.length));
    if (!width) return "";
    const line = (row: string[]) =>
      "| " +
      Array.from({ length: width }, (_, i) => row[i] || "").join(" | ") +
      " |";
    const header = children[0]?.content?.every(
      (cell) => cell.type === "table_header",
    )
      ? grid.shift()!
      : [];
    return (
      [line(header), line(Array(width).fill("---")), ...grid.map(line)].join(
        "\n",
      ) + "\n\n"
    );
  }
  if (node.type === "horizontal_rule") return "\n---\n\n";
  return body;
}
export function createItem(
  ws: Workspace,
  kind: Kind,
  title: string,
  content = template(kind),
  parentId?: string,
): Item {
  if (!title.trim()) throw new Error("Escribe un título.");
  if (parentId) {
    const parent = ws.items.find((i) => i.id === parentId && !i.archived);
    if (!parent) throw new Error("El elemento padre no existe.");
    if (kind === "story" && parent.kind !== "epic")
      throw new Error("Una historia pertenece a una épica.");
    if (kind === "task" && !["story", "task"].includes(parent.kind))
      throw new Error("Una subtarea pertenece a una historia o tarea.");
  }
  const now = new Date().toISOString();
  const item: Item = {
    id: id(),
    kind,
    title: title.trim(),
    summary: "",
    content,
    status: "todo",
    parentId,
    criteria: [],
    priority: "normal",
    archived: false,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    history: [],
    evidence: "",
    ...(kind === "knowledge" ? { freshness: "draft" as const } : {}),
  };
  ws.items.push(item);
  return item;
}
export function descendants(ws: Workspace, parent: string): Item[] {
  const found: Item[] = [];
  const visited = new Set<string>([parent]);
  const walk = (p: string) => {
    for (const i of ws.items.filter(
      (i) => i.parentId === p && !i.archived && !visited.has(i.id),
    )) {
      visited.add(i.id);
      found.push(i);
      walk(i.id);
    }
  };
  walk(parent);
  return found;
}
export function canReach(ws: Workspace, from: string, to: string): boolean {
  const visited = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const n = queue.pop()!;
    if (n === to) return true;
    if (visited.has(n)) continue;
    visited.add(n);
    queue.push(
      ...ws.relations
        .filter((r) => r.source === n && r.type === "depends")
        .map((r) => r.target),
    );
  }
  return false;
}
const isCard = (item?: Item) => !!item && item.kind !== "knowledge";
export const nodeOf = (ws: Workspace, key: string) => ws.nodes?.find((n) => n.id === key);
/** Why a relation is not allowed, or undefined. Item relations join items; node relations start at a node. */
export function relationProblem(ws: Workspace, r: Pick<Relation, "source" | "target" | "type">): string | undefined {
  const item = (key: string) => ws.items.find((i) => i.id === key);
  if ((itemRelationTypes as readonly string[]).includes(r.type))
    return item(r.source) && item(r.target) ? undefined : "Relación sin un elemento válido.";
  const source = nodeOf(ws, r.source), target = nodeOf(ws, r.target);
  if (r.type === "covers")
    return source?.kind === "screen" && isCard(item(r.target)) ? undefined : "covers une una pantalla con una tarjeta.";
  if (r.type === "implements") {
    if (source?.kind !== "code" || !isCard(item(r.target))) return "implements une un nodo de código con una tarjeta.";
    const owner = ws.relations.find((x) => x.type === "implements" && x.source === r.source && x.target !== r.target);
    return owner ? `${r.source} ya tiene dueña: ${owner.target}. Un archivo implementa una sola tarjeta.` : undefined;
  }
  if (r.type === "uses")
    return source?.kind === "code" && (target?.kind === "code" || target?.kind === "token") ? undefined : "uses une código con código o con un token.";
  return "Tipo de relación inválido.";
}
const pathOK = (value: unknown, max = territoryLimits.path) =>
  typeof value === "string" && !!value.trim() && value.length <= max && !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("//");
export function validatePaths(value: unknown, name: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((p) => !pathOK(p)))
    throw new Error(`${name}: lista de hasta ${max} rutas relativas de hasta ${territoryLimits.path} caracteres.`);
  return [...new Set(value as string[])];
}
export function validateBaseline(value: unknown): Baseline {
  if (value === null) return null;
  const hashOK = (h: unknown) => typeof h === "string" && !!h && h.length <= territoryLimits.hash;
  if (hashOK(value)) return value as string;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length <= territoryLimits.baseline && entries.every(([k, h]) => /^[a-zA-Z0-9_-]{1,80}$/.test(k) && hashOK(h))) return { ...(value as Record<string, string>) };
  }
  throw new Error("builtAgainst: null, una huella de texto o un objeto { idDeNodo: hash }.");
}
export function validateNode(value: unknown): PlanNode {
  const n = value as PlanNode;
  if (!n || typeof n !== "object" || Object.keys(n).some((k) => !["id", "kind", "ref", "label", "approvedHash", "hash"].includes(k)))
    throw new Error("usa id, kind, ref y opcionalmente label, approvedHash y hash.");
  if (typeof n.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(n.id)) throw new Error("id: letras, números, guion o guion bajo, hasta 80.");
  if (!["screen", "code", "token"].includes(n.kind)) throw new Error("kind: screen, code o token.");
  if (n.kind === "screen") {
    const ref = n.ref as { file: string; screen: string };
    if (!ref || typeof ref !== "object" || Object.keys(ref).some((k) => !["file", "screen"].includes(k)) || !pathOK(ref.file) || typeof ref.screen !== "string" || !ref.screen || ref.screen.length > territoryLimits.path)
      throw new Error("ref de pantalla: { file, screen } con ruta relativa.");
  } else if (n.kind === "code" ? !pathOK(n.ref) : typeof n.ref !== "string" || !n.ref || n.ref.length > 120) throw new Error(n.kind === "code" ? "ref de código: ruta relativa." : "ref de token: texto de hasta 120.");
  if (n.label !== undefined && (typeof n.label !== "string" || n.label.length > 120)) throw new Error("label: hasta 120 caracteres.");
  for (const field of ["approvedHash", "hash"] as const)
    if (n[field] !== undefined && (typeof n[field] !== "string" || !n[field] || n[field]!.length > territoryLimits.hash)) throw new Error(`${field}: texto de hasta ${territoryLimits.hash}.`);
  if (n.approvedHash !== undefined && n.kind !== "screen") throw new Error("approvedHash solo existe en pantallas.");
  return n;
}
export function addRelation(
  ws: Workspace,
  source: string,
  target: string,
  type: Relation["type"],
): void {
  if (source === target)
    throw new Error("Un elemento no se puede relacionar consigo mismo.");
  const problem = relationProblem(ws, { source, target, type });
  if (problem) throw new Error(problem);
  if (
    ws.relations.some(
      (r) => r.source === source && r.target === target && r.type === type,
    )
  )
    return;
  if (type === "depends" && canReach(ws, target, source))
    throw new Error("Esta dependencia crearía un ciclo.");
  if (
    type === "modifies" &&
    ws.items.find((i) => i.id === target)?.kind !== "knowledge"
  )
    throw new Error("El destino debe ser una ficha de conocimiento.");
  ws.relations.push({ id: id(), source, target, type });
  if (type === "modifies") {
    const doc = ws.items.find((i) => i.id === target)!;
    doc.freshness = "review";
  }
}
export function blockers(ws: Workspace, item: Item): Item[] {
  return ws.relations
    .filter((r) => r.source === item.id && r.type === "depends")
    .map((r) => ws.items.find((i) => i.id === r.target))
    .filter((i): i is Item => !!i && i.status !== "done");
}
export function completionIssues(ws: Workspace, item: Item): string[] {
  const issues: string[] = [];
  if (item.criteria.some((c) => !c.checked))
    issues.push("Hay criterios de aceptación pendientes.");
  if (blockers(ws, item).length) issues.push("Hay dependencias sin terminar.");
  if (descendants(ws, item.id).some((i) => i.status !== "done"))
    issues.push("Hay trabajo hijo sin terminar.");
  if (!item.evidence.trim())
    issues.push("Registra cómo verificaste el resultado.");
  const docs = ws.relations
    .filter((r) => r.source === item.id && r.type === "modifies")
    .map((r) => ws.items.find((i) => i.id === r.target));
  if (docs.some((i) => i?.freshness !== "current"))
    issues.push("Revisa la documentación afectada.");
  return issues;
}
export function setStatus(ws: Workspace, item: Item, status: Status): void {
  if (status === "done") {
    const issues = completionIssues(ws, item);
    if (issues.length) throw new Error(issues.join(" "));
  }
  if (item.status === "done" && status !== "done") markAffected(ws, item.id);
  item.status = status;
  item.updatedAt = new Date().toISOString();
}
/**
 * From an item: marks the knowledge it modifies as "review" (stored, as before) and returns those documents.
 * From a node: pure, changes nothing, and returns its impact (see `impact`).
 */
export function markAffected(ws: Workspace, source: string): Impact[] {
  if (nodeOf(ws, source)) return impact(ws, source);
  const docs: Impact[] = [];
  for (const r of ws.relations.filter(
    (r) => r.source === source && r.type === "modifies",
  )) {
    const doc = ws.items.find((i) => i.id === r.target);
    if (doc) { doc.freshness = "review"; docs.push({ id: doc.id, severity: "docs", via: [source] }); }
  }
  return docs;
}
export function reviseKnowledge(
  item: Item,
  content: RichNode,
  evidence: string,
  source?: string,
): void {
  if (item.kind !== "knowledge")
    throw new Error("Solo se revisa conocimiento.");
  if (!evidence.trim())
    throw new Error("Indica cómo o contra qué versión revisaste la ficha.");
  item.history.unshift({
    revision: item.revision,
    at: item.updatedAt,
    content: structuredClone(item.content),
    summary: item.summary,
    evidence: item.evidence,
    source,
  });
  item.content = structuredClone(content);
  item.pendingChange = undefined;
  item.pendingEvidence = undefined;
  item.revision++;
  item.freshness = "current";
  item.evidence = evidence.trim();
  item.updatedAt = new Date().toISOString();
}
/** Relations of an item or a node. The other end is `item` for cards and documents, `node` for screens, code and tokens. */
export function neighbors(ws: Workspace, key: string) {
  return ws.relations
    .filter((r) => r.source === key || r.target === key)
    .map((r) => {
      const other = r.source === key ? r.target : r.source;
      return {
        id: r.id,
        relation: r.type,
        direction: r.source === key ? "out" : "in",
        item: ws.items.find((i) => i.id === other),
        node: nodeOf(ws, other),
      };
    });
}
export const nodeName = (node: PlanNode) => node.label || (typeof node.ref === "string" ? node.ref : node.ref.screen);
/** Labels are compared normalized: lowercase, trimmed, spaces as hyphens, bounded length. */
export function normalizeLabel(value: unknown): string {
  if (typeof value !== "string") throw new Error("Cada etiqueta debe ser texto.");
  const label = value.trim().toLocaleLowerCase().replace(/\s+/g, "-").replace(/^#/, "");
  if (!label || label.length > labelLimits.length || /[\s#,]/.test(label))
    throw new Error(`Etiqueta inválida: «${value}». Hasta ${labelLimits.length} caracteres, sin espacios ni «#».`);
  return label;
}
export function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("labels debe ser una lista de textos.");
  const labels = [...new Set(value.map(normalizeLabel))];
  if (labels.length > labelLimits.perItem) throw new Error(`Hasta ${labelLimits.perItem} etiquetas por ficha.`);
  return labels;
}
const relativePath = (value: unknown, name: string, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${name}: ruta de hasta ${max} caracteres requerida.`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) throw new Error(`${name}: solo rutas relativas, sin esquema (http:, data:…).`);
  return value;
};
export function validateDesignRefs(value: unknown): DesignRef[] {
  if (!Array.isArray(value)) throw new Error("design debe ser una lista de referencias { file, screen }.");
  if (value.length > designLimits.perItem) throw new Error(`Hasta ${designLimits.perItem} referencias de diseño por ficha.`);
  const seen = new Set<string>();
  return value.map((ref): DesignRef => {
    if (!ref || typeof ref !== "object" || Object.keys(ref).some(key => !["file", "screen", "name", "image"].includes(key)))
      throw new Error("Referencia de diseño inválida: usa file, screen y opcionalmente name e image.");
    const file = relativePath(ref.file, "design.file", designLimits.path);
    if (typeof ref.screen !== "string" || !ref.screen.trim() || ref.screen.length > designLimits.path) throw new Error("design.screen: texto de hasta 300 caracteres requerido.");
    if (ref.name !== undefined && (typeof ref.name !== "string" || ref.name.length > designLimits.name)) throw new Error("design.name: texto de hasta 120 caracteres.");
    const key = `${file}#${ref.screen}`;
    if (seen.has(key)) throw new Error(`Referencia de diseño repetida: ${key}.`);
    seen.add(key);
    return { file, screen: ref.screen, ...(ref.name !== undefined ? { name: ref.name } : {}), ...(ref.image !== undefined ? { image: relativePath(ref.image, "design.image", designLimits.path) } : {}) };
  });
}
export function validateFile(value: unknown): string { return relativePath(value, "file", designLimits.path); }
/** Active items that reference a screen of a design file. */
export function itemsByDesign(ws: Workspace, file: string, screen: string): Item[] {
  return ws.items.filter(i => !i.archived && i.design?.some(ref => ref.file === file && ref.screen === screen));
}
/** Appends to the item's log, keeping the newest `activityLimit` entries. */
export function recordActivity(item: Item, entry: Omit<ActivityEntry, "at"> & { at?: string }): void {
  const clean = Object.fromEntries(Object.entries({ at: entry.at ?? new Date().toISOString(), ...entry }).filter(([, v]) => v !== undefined)) as ActivityEntry;
  item.activity = [...(item.activity ?? []), clean].slice(-activityLimit);
}
export type AgentSnapshot = {
  name: string; revision: number; counts: Record<Status, number>;
  items: { id: string; kind: Kind; status: Status; title: string; parent?: string; labels?: string[]; criteria?: string; design?: number; stale?: CardSignal["reason"][] }[];
  /** Screens, code and tokens: [id, kind] and, for screens, whether they are approved. */
  nodes?: [string, NodeKind, boolean?][];
  relations: [string, Relation["type"], string][];
  focus?: { id: string; kind: Kind; status: Status; title: string; summary: string; markdown: string; criteria: Criterion[]; evidence: string; labels: string[]; design: DesignRef[]; activity: ActivityEntry[]; relations: { direction: string; type: Relation["type"]; id?: string; title?: string }[] };
};
/** The board in a few characters per card, for an agent's context. Only `focus` carries full content. */
export function agentSnapshot(ws: Workspace, opts: { focus?: string; include?: ("criteria" | "design" | "labels")[] } = {}): AgentSnapshot {
  const include = new Set(opts.include ?? ["criteria", "design", "labels"]);
  const active = ws.items.filter(i => !i.archived);
  const counts = Object.fromEntries(statuses.map(([status]) => [status, active.filter(i => i.status === status).length])) as Record<Status, number>;
  const focus = opts.focus ? active.find(i => i.id === opts.focus) : undefined;
  return {
    name: ws.name, revision: ws.revision, counts,
    items: active.map(i => ({
      id: i.id, kind: i.kind, status: i.status, title: i.title,
      ...(i.parentId ? { parent: i.parentId } : {}),
      ...(include.has("labels") && i.labels?.length ? { labels: i.labels } : {}),
      ...(include.has("criteria") && i.criteria.length ? { criteria: `${i.criteria.filter(c => c.checked).length}/${i.criteria.length}` } : {}),
      ...(include.has("design") && i.design?.length ? { design: i.design.length } : {}),
      ...(stale => stale.length ? { stale } : {})([...new Set(cardSignals(ws, i.id).map(signal => signal.reason))]),
    })),
    relations: ws.relations.filter(r => [r.source, r.target].every(key => active.some(i => i.id === key) || nodeOf(ws, key))).map(r => [r.source, r.type, r.target]),
    ...(ws.nodes?.length ? { nodes: ws.nodes.map((n): [string, NodeKind, boolean?] => n.kind === "screen" ? [n.id, n.kind, !!n.approvedHash] : [n.id, n.kind]) } : {}),
    ...(focus ? { focus: {
      id: focus.id, kind: focus.kind, status: focus.status, title: focus.title, summary: focus.summary, markdown: markdown(focus.content),
      criteria: focus.criteria, evidence: focus.evidence, labels: focus.labels ?? [], design: focus.design ?? [], activity: focus.activity ?? [],
      relations: neighbors(ws, focus.id).map(n => ({ direction: n.direction, type: n.relation, id: n.item?.id, title: n.item?.title })),
    } } : {}),
  };
}
export type WorkspaceDiff = {
  created: string[]; archived: string[]; restored: string[]; status: { id: string; from: Status; to: Status }[]; updated: { id: string; fields: string[] }[];
  nodes: { created: string[]; removed: string[]; updated: { id: string; fields: string[] }[] };
};
const diffFields = ["title", "summary", "content", "criteria", "priority", "parentId", "evidence", "design", "labels", "file", "paths", "owns", "builtAgainst", "freshness", "revision"] as const;
/** What changed between two readings of the same workspace, by id. */
export function workspaceDiff(prev: Workspace, next: Workspace): WorkspaceDiff {
  const diff: WorkspaceDiff = { created: [], archived: [], restored: [], status: [], updated: [], nodes: { created: [], removed: [], updated: [] } };
  const oldNodes = new Map((prev.nodes ?? []).map(n => [n.id, n]));
  for (const node of next.nodes ?? []) {
    const old = oldNodes.get(node.id);
    if (!old) { diff.nodes.created.push(node.id); continue; }
    oldNodes.delete(node.id);
    const fields = (["kind", "ref", "label", "approvedHash", "hash"] as const).filter(f => JSON.stringify(old[f] ?? null) !== JSON.stringify(node[f] ?? null));
    if (fields.length) diff.nodes.updated.push({ id: node.id, fields: [...fields] });
  }
  diff.nodes.removed.push(...oldNodes.keys());
  const before = new Map(prev.items.map(i => [i.id, i]));
  for (const item of next.items) {
    const old = before.get(item.id);
    if (!old) { diff.created.push(item.id); continue; }
    if (!old.archived && item.archived) diff.archived.push(item.id);
    if (old.archived && !item.archived) diff.restored.push(item.id);
    if (old.status !== item.status) diff.status.push({ id: item.id, from: old.status, to: item.status });
    const fields = diffFields.filter(field => JSON.stringify(old[field] ?? null) !== JSON.stringify(item[field] ?? null));
    if (fields.length) diff.updated.push({ id: item.id, fields: [...fields] });
  }
  return diff;
}
/**
 * - changeset: the card that owns the changed code; it is its own change, not "affected".
 * - affected: a card whose dependency or design changed.
 * - visual: a screen to look at again (light signal, token radius only).
 * - docs: knowledge marked for review by markAffected from an item.
 */
export type ImpactSeverity = "changeset" | "affected" | "visual" | "docs";
export type Impact = { id: string; severity: ImpactSeverity; via: string[] };
const ownerOf = (ws: Workspace, code: string) => ws.relations.find((r) => r.type === "implements" && r.source === code)?.target;
/**
 * Who a change to a node reaches. Pure: computed from the stored graph, changes nothing.
 * Screen: the cards it covers. Code: its owner (changeset); up the `uses` edges, the first card owner on each
 * branch (affected). Token: every card owner up the `uses` chain (affected) and the screens covering them (visual).
 */
export function impact(ws: Workspace, nodeId: string): Impact[] {
  const node = nodeOf(ws, nodeId);
  if (!node) return [];
  const result = new Map<string, Impact>();
  const rank: Record<ImpactSeverity, number> = { visual: 0, docs: 1, changeset: 2, affected: 3 };
  const add = (id: string, severity: ImpactSeverity, via: string[]) => {
    const old = result.get(id);
    if (!old || rank[severity] > rank[old.severity]) result.set(id, { id, severity, via });
  };
  if (node.kind === "screen") {
    for (const r of ws.relations.filter((r) => r.type === "covers" && r.source === nodeId)) add(r.target, "affected", [nodeId]);
    return [...result.values()];
  }
  const own = node.kind === "code" ? ownerOf(ws, nodeId) : undefined;
  if (own) add(own, "changeset", [nodeId]);
  const passThrough = node.kind === "token";
  const seen = new Set([nodeId]);
  const queue: string[][] = [[nodeId]];
  while (queue.length) {
    const path = queue.shift()!;
    for (const r of ws.relations.filter((r) => r.type === "uses" && r.target === path[path.length - 1])) {
      if (seen.has(r.source)) continue;
      seen.add(r.source);
      const via = [...path, r.source], owner = ownerOf(ws, r.source);
      if (owner && owner !== own) {
        add(owner, "affected", via);
        if (passThrough)
          for (const c of ws.relations.filter((c) => c.type === "covers" && c.target === owner)) add(c.source, "visual", [...via, owner]);
        // API radius stops at the first owner; the token radius passes through.
        else continue;
      }
      queue.push(via);
    }
  }
  return [...result.values()];
}
/** What a card depends on right now: the approved screens covering it and what its own code uses, up to other owners. */
export function baselineFor(ws: Workspace, cardId: string): Record<string, string> {
  const baseline: Record<string, string> = {};
  for (const r of ws.relations.filter((r) => r.type === "covers" && r.target === cardId)) {
    const screen = nodeOf(ws, r.source);
    if (screen?.approvedHash) baseline[screen.id] = screen.approvedHash;
  }
  // Code owned by another card is recorded but not entered (API radius), except to reach tokens (visual radius).
  const queue: [string, boolean][] = ws.relations.filter((r) => r.type === "implements" && r.target === cardId).map((r) => [r.source, false]);
  const seen = new Set(queue.map(([code]) => code));
  while (queue.length) {
    const [code, tokensOnly] = queue.shift()!;
    for (const r of ws.relations.filter((r) => r.type === "uses" && r.source === code)) {
      if (seen.has(r.target)) continue;
      seen.add(r.target);
      const dep = nodeOf(ws, r.target)!, owner = ownerOf(ws, dep.id);
      if (dep.hash && (!tokensOnly || dep.kind === "token")) baseline[dep.id] = dep.hash;
      if (dep.kind === "code") queue.push([dep.id, tokensOnly || (!!owner && owner !== cardId)]);
    }
  }
  return Object.fromEntries(Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)));
}
/** Short stable fingerprint of a baseline, for hosts that store builtAgainst as a single string. One screen: its approvedHash. */
export function baselineFingerprint(baseline: Record<string, string>): string {
  const entries = Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 1) return entries[0][1];
  let hash = 0x811c9dc5;
  for (const char of entries.map(([k, v]) => `${k}=${v}`).join("|")) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return `fp-${hash.toString(16).padStart(8, "0")}`;
}
export type CardSignal = { node?: string; kind?: NodeKind; reason: "design" | "dependency" | "baseline"; built?: string; current?: string };
/**
 * Why a card no longer matches what it was built against. Derived only from stored facts, so it turns off by
 * itself when the design is re-approved to the same hash or the card is rebuilt. No baseline gives no signal.
 * With a string baseline the reason is "baseline" (which node changed is unknown).
 */
export function cardSignals(ws: Workspace, cardId: string): CardSignal[] {
  const card = ws.items.find((i) => i.id === cardId);
  const built = card?.builtAgainst;
  if (!card || built === null || built === undefined) return [];
  const current = baselineFor(ws, cardId);
  if (typeof built === "string") {
    const now = Object.keys(current).length ? baselineFingerprint(current) : undefined;
    return now === undefined || now === built ? [] : [{ reason: "baseline", built, current: now }];
  }
  const signals: CardSignal[] = [];
  for (const [nodeId, hash] of Object.entries(current)) {
    if (built[nodeId] === hash) continue;
    const node = nodeOf(ws, nodeId)!;
    signals.push({ node: nodeId, kind: node.kind, reason: node.kind === "screen" ? "design" : "dependency", built: built[nodeId], current: hash });
  }
  return signals;
}
/** Done cards that changed underneath and no test covers: propose a verification. They are never reopened. */
export function verificationProposals(ws: Workspace, isCovered: (cardId: string) => boolean = () => false): { id: string; signals: CardSignal[] }[] {
  return ws.items
    .filter((i) => !i.archived && i.status === "done" && i.kind !== "knowledge")
    .map((i) => ({ id: i.id, signals: cardSignals(ws, i.id) }))
    .filter((p) => p.signals.length > 0 && !isCovered(p.id));
}
export function contextRecords(ws: Workspace) {
  return ws.items
    .filter((i) => !i.archived)
    .map((i) => ({
      id: i.id,
      title: i.title,
      kind: i.kind,
      summary: i.summary || plain(i.content).slice(0, 180),
      revision: i.revision,
      freshness: i.freshness,
      updatedAt: i.updatedAt,
      parentId: i.parentId,
      ...(i.labels?.length ? { labels: i.labels } : {}),
      ...(i.design?.length ? { design: i.design } : {}),
      ...(i.file ? { file: i.file } : {}),
      ...(i.paths?.length ? { paths: i.paths } : {}),
      relations: neighbors(ws, i.id).map((n) => ({
        type: n.relation,
        direction: n.direction,
        id: n.item?.id ?? n.node?.id,
        title: n.item?.title ?? (n.node && nodeName(n.node)),
        ...(n.node ? { node: n.node.kind } : {}),
      })),
    }));
}
export function exportItem(ws: Workspace, item: Item): string {
  return `# ${item.title}\n\nID: ${item.id}\nTipo: ${kindLabels[item.kind]}\nRevisión: ${item.revision}\nEstado: ${item.freshness || item.status}\nActualizado: ${item.updatedAt}\n${item.labels?.length ? `Etiquetas: ${item.labels.join(", ")}\n` : ""}${item.file ? `Archivo: ${item.file}\n` : ""}${item.paths?.length ? `Territorio: ${item.paths.join(", ")}\n` : ""}${item.design?.length ? `Diseño: ${item.design.map((d) => `${d.file}#${d.screen}${d.name ? ` (${d.name})` : ""}`).join(", ")}\n` : ""}\n${item.summary ? item.summary + "\n\n" : ""}${markdown(item.content)}${item.criteria.length ? "## Criterios de aceptación\n" + item.criteria.map((c) => `- [${c.checked ? "x" : " "}] ${c.text}`).join("\n") + "\n\n" : ""}${item.evidence ? "## Verificación\n" + item.evidence + "\n\n" : ""}## Relaciones\n${neighbors(
    ws,
    item.id,
  )
    .map(
      (n) =>
        `- ${n.direction === "in" ? "←" : "→"} ${n.relation}: ${n.item?.title ?? (n.node ? `${n.node.kind} ${nodeName(n.node)}` : "")} (${n.item?.id ?? n.node?.id})`,
    )
    .join("\n")}\n`;
}
export function validateWorkspace(data: unknown): asserts data is Workspace {
  const fail = (
    message = "El archivo no es un espacio de Codaru Planning compatible.",
  ): never => {
    throw new Error(message);
  };
  if (!data || typeof data !== "object") fail();
  const w = data as Workspace;
  if (
    w.schemaVersion !== 1 ||
    !Number.isSafeInteger(w.revision) ||
    w.revision < 0 ||
    typeof w.name !== "string" ||
    !Array.isArray(w.items) ||
    !Array.isArray(w.relations) ||
    !Array.isArray(w.deliveries) ||
    typeof w.exampleDismissed !== "boolean" ||
    !w.settings
  )
    fail();
  const s = w.settings;
  if (
    !["system", "light", "dark"].includes(s.theme) ||
    !/^#[a-fA-F0-9]{6}$/.test(s.accent) ||
    typeof s.font !== "string" ||
    !Number.isFinite(s.fontSize) ||
    s.fontSize < 11 ||
    s.fontSize > 18 ||
    !["comfortable", "compact"].includes(s.density) ||
    typeof s.sidebar !== "boolean" ||
    !["status", "epics"].includes(s.board)
  )
    fail("Las preferencias del archivo no son válidas.");
  const keyOK = (v: unknown): v is string =>
    typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
  const criteriaOK = (v: Criterion[]) =>
    Array.isArray(v) &&
    v.every(
      (c) =>
        c &&
        keyOK(c.id) &&
        typeof c.text === "string" &&
        typeof c.checked === "boolean",
    ) &&
    new Set(v.map((c) => c.id)).size === v.length;
  const dateOK = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v));
  const keys = new Set<string>();
  for (const i of w.items) {
    if (
      !i ||
      !keyOK(i.id) ||
      keys.has(i.id) ||
      !Object.hasOwn(kindLabels, i.kind) ||
      typeof i.title !== "string" ||
      typeof i.summary !== "string" ||
      typeof i.evidence !== "string" ||
      typeof i.archived !== "boolean" ||
      !criteriaOK(i.criteria) ||
      !Array.isArray(i.history) ||
      i.content?.type !== "doc" ||
      !statuses.some(([status]) => status === i.status) ||
      !["normal", "high"].includes(i.priority) ||
      !Number.isSafeInteger(i.revision) ||
      i.revision < 1 ||
      !dateOK(i.createdAt) ||
      !dateOK(i.updatedAt)
    )
      fail("El archivo contiene fichas inválidas.");
    if (
      i.kind === "knowledge" &&
      !["draft", "current", "review"].includes(i.freshness!)
    )
      fail("Vigencia documental inválida.");
    if (i.pendingChange && i.pendingChange.type !== "doc")
      fail("Borrador documental inválido.");
    if (
      i.pendingEvidence !== undefined &&
      typeof i.pendingEvidence !== "string"
    )
      fail("La verificación del borrador no es válida.");
    if (i.labels !== undefined && (!Array.isArray(i.labels) || i.labels.length > labelLimits.perItem || i.labels.some(l => typeof l !== "string" || !l || l.length > labelLimits.length) || new Set(i.labels).size !== i.labels.length))
      fail("Las etiquetas de una ficha no son válidas.");
    if (i.design !== undefined) { try { validateDesignRefs(i.design); } catch { fail("Las referencias de diseño no son válidas."); } }
    if (i.file !== undefined && (i.kind !== "knowledge" || typeof i.file !== "string" || !i.file || i.file.length > designLimits.path))
      fail("El archivo de una ficha de conocimiento no es válido.");
    try {
      if (i.paths !== undefined) validatePaths(i.paths, "paths", territoryLimits.paths);
      if (i.owns !== undefined) validatePaths(i.owns, "owns", territoryLimits.owns);
      if (i.builtAgainst !== undefined) validateBaseline(i.builtAgainst);
    } catch { fail("El territorio o la línea base de una ficha no son válidos."); }
    if (i.activity !== undefined && (!Array.isArray(i.activity) || i.activity.length > activityLimit || i.activity.some(a => !a || !dateOK(a.at) || typeof a.op !== "string" || [a.actor, a.note, a.from, a.to].some(v => v !== undefined && typeof v !== "string") || (a.fields !== undefined && (!Array.isArray(a.fields) || a.fields.some(f => typeof f !== "string"))))))
      fail("La actividad de una ficha no es válida.");
    if (
      i.history.some(
        (r) =>
          !r ||
          !Number.isInteger(r.revision) ||
          !dateOK(r.at) ||
          r.content?.type !== "doc" ||
          typeof r.summary !== "string",
      )
    )
      fail("Historial documental inválido.");
    keys.add(i.id);
  }
  const ends = new Set(keys);
  if (w.nodes !== undefined) {
    if (!Array.isArray(w.nodes) || w.nodes.length > territoryLimits.nodes) fail("Los nodos del espacio no son válidos.");
    for (const n of w.nodes) {
      try { validateNode(n); } catch (error) { fail(`Nodo inválido: ${error instanceof Error ? error.message : error}`); }
      if (ends.has(n.id)) fail(`El id ${n.id} se repite entre fichas y nodos.`);
      ends.add(n.id);
    }
  }
  const relationKeys = new Set<string>();
  for (const r of w.relations) {
    if (
      !r ||
      !keyOK(r.id) ||
      relationKeys.has(r.id) ||
      !ends.has(r.source) ||
      !ends.has(r.target) ||
      r.source === r.target ||
      ![...itemRelationTypes, ...nodeRelationTypes].some((t) => t === r.type) ||
      relationProblem({ ...w, relations: w.relations.filter((x) => x !== r) }, r)
    )
      fail("El archivo contiene relaciones inválidas.");
    if (
      r.type === "modifies" &&
      w.items.find((i) => i.id === r.target)?.kind !== "knowledge"
    )
      fail("La documentación vinculada no es válida.");
    relationKeys.add(r.id);
  }
  for (const i of w.items) {
    if (i.parentId && !keys.has(i.parentId))
      fail("El archivo contiene padres inexistentes.");
    let parent = i.parentId;
    const seen = new Set([i.id]);
    while (parent) {
      if (seen.has(parent)) fail("La jerarquía contiene un ciclo.");
      seen.add(parent);
      parent = w.items.find((n) => n.id === parent)?.parentId;
    }
  }
  for (const r of w.relations.filter((r) => r.type === "depends")) {
    const rest = { ...w, relations: w.relations.filter((x) => x !== r) };
    if (canReach(rest, r.target, r.source))
      fail("Las dependencias contienen un ciclo.");
  }
  for (const d of w.deliveries) {
    if (
      !d ||
      !keyOK(d.id) ||
      typeof d.title !== "string" ||
      typeof d.notes !== "string" ||
      !dateOK(d.at) ||
      !Array.isArray(d.items) ||
      d.items.some((i) => !keys.has(i)) ||
      !Array.isArray(d.documents) ||
      d.documents.some(
        (doc) => !keys.has(doc.id) || !Number.isSafeInteger(doc.revision),
      )
    )
      fail("Las entregas del archivo no son válidas.");
  }
  if (
    w.draft &&
    (!Object.hasOwn(kindLabels, w.draft.kind) ||
      typeof w.draft.title !== "string" ||
      w.draft.content?.type !== "doc" ||
      !criteriaOK(w.draft.criteria) ||
      (w.draft.parentId && !keys.has(w.draft.parentId)))
  )
    fail("El borrador del archivo no es válido.");
}
export function initialWorkspace(): Workspace {
  const ws: Workspace = {
    schemaVersion: 1,
    revision: 0,
    name: "Mi espacio",
    items: [],
    relations: [],
    deliveries: [],
    settings: { ...defaultSettings },
    exampleDismissed: false,
  };
  const epic = createItem(ws, "epic", "Mi primera entrega");
  const story = createItem(
    ws,
    "story",
    "Definir el resultado que quiero entregar",
    rich(
      heading("Qué queremos lograr"),
      paragraph("Describe el resultado que quieres poner en manos de alguien."),
      heading("Cómo lo vamos a resolver"),
      paragraph(
        "Divide el trabajo en pasos concretos y conecta lo que necesita saber quien lo continúe.",
      ),
    ),
    epic.id,
  );
  story.summary = "Una historia de ejemplo para explorar tu espacio.";
  story.criteria = [
    { id: id(), text: "El resultado esperado está descrito.", checked: false },
    {
      id: id(),
      text: "Hay una forma concreta de verificarlo.",
      checked: false,
    },
  ];
  createItem(
    ws,
    "task",
    "Escribir los criterios de aceptación",
    template("task"),
    story.id,
  );
  createItem(
    ws,
    "idea",
    "Una idea para la siguiente evolución",
    rich(
      paragraph(
        "Captura aquí lo que todavía no está listo para convertirse en trabajo.",
      ),
    ),
  );
  const doc = createItem(
    ws,
    "knowledge",
    "Cómo funciona mi producto",
    rich(
      heading("Qué hace"),
      paragraph("Esta ficha conserva el comportamiento vigente del producto."),
      heading("Cómo funciona"),
      paragraph("Cuando termine una historia, actualiza aquí lo que cambió."),
      heading("Reglas y límites"),
      paragraph(
        "Indica las restricciones que debe conocer la siguiente persona o IA.",
      ),
    ),
  );
  doc.summary =
    "Una ficha permanente que sigue disponible después de cerrar el trabajo.";
  addRelation(ws, story.id, doc.id, "modifies");
  return ws;
}
