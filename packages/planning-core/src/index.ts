export type Kind = "idea" | "epic" | "story" | "task" | "knowledge";
export type Status = "todo" | "doing" | "review" | "done";
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};
export type Relation = {
  id: string;
  source: string;
  target: string;
  type: "depends" | "modifies" | "references";
};
export type Criterion = { id: string; text: string; checked: boolean };
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
export function addRelation(
  ws: Workspace,
  source: string,
  target: string,
  type: Relation["type"],
): void {
  if (source === target)
    throw new Error("Un elemento no se puede relacionar consigo mismo.");
  if (
    !ws.items.some((i) => i.id === source) ||
    !ws.items.some((i) => i.id === target)
  )
    throw new Error("Relación sin un elemento válido.");
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
export function markAffected(ws: Workspace, source: string): void {
  for (const r of ws.relations.filter(
    (r) => r.source === source && r.type === "modifies",
  )) {
    const doc = ws.items.find((i) => i.id === r.target);
    if (doc) doc.freshness = "review";
  }
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
export function neighbors(ws: Workspace, key: string) {
  return ws.relations
    .filter((r) => r.source === key || r.target === key)
    .map((r) => ({
      id: r.id,
      relation: r.type,
      direction: r.source === key ? "out" : "in",
      item: ws.items.find(
        (i) => i.id === (r.source === key ? r.target : r.source),
      ),
    }));
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
      relations: neighbors(ws, i.id).map((n) => ({
        type: n.relation,
        direction: n.direction,
        id: n.item?.id,
        title: n.item?.title,
      })),
    }));
}
export function exportItem(ws: Workspace, item: Item): string {
  return `# ${item.title}\n\nID: ${item.id}\nTipo: ${kindLabels[item.kind]}\nRevisión: ${item.revision}\nEstado: ${item.freshness || item.status}\nActualizado: ${item.updatedAt}\n\n${item.summary ? item.summary + "\n\n" : ""}${markdown(item.content)}${item.criteria.length ? "## Criterios de aceptación\n" + item.criteria.map((c) => `- [${c.checked ? "x" : " "}] ${c.text}`).join("\n") + "\n\n" : ""}${item.evidence ? "## Verificación\n" + item.evidence + "\n\n" : ""}## Relaciones\n${neighbors(
    ws,
    item.id,
  )
    .map(
      (n) =>
        `- ${n.direction === "in" ? "←" : "→"} ${n.relation}: ${n.item?.title} (${n.item?.id})`,
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
  const relationKeys = new Set<string>();
  for (const r of w.relations) {
    if (
      !r ||
      !keyOK(r.id) ||
      relationKeys.has(r.id) ||
      !keys.has(r.source) ||
      !keys.has(r.target) ||
      r.source === r.target ||
      !["depends", "modifies", "references"].includes(r.type)
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
