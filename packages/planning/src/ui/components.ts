import { blockers, descendants, neighbors, plain, kindLabels, statuses, type Item, type Kind, type Workspace, type Status, type DesignRef } from "../../../planning-core/src/index.js";
import { icon as defaultIcon, esc, type IconRenderer } from "./icons.js";
export { icon, iconNames, type IconRenderer } from "./icons.js";

/* ───────── Markup ─────────
 * Each function returns the exact markup the desktop application renders.
 * Hosts that do their own event delegation can use them directly; everyone
 * else uses the mount* functions below. */

export type View = "board" | "knowledge" | "deliveries" | "graph" | "archive";
export type DetailTab = "content" | "subtasks" | "context" | "diagram" | "history";
export const viewTitles: Record<View, string> = { board: "Planificación", knowledge: "Conocimiento", deliveries: "Entregas", graph: "Relaciones", archive: "Archivo" };
const itemBy = (ws: Workspace, key: string) => ws.items.find(i => i.id === key)!;
export const shortId = (ws: Workspace, item: Item) => `${item.kind === "knowledge" ? "DOC" : "P"}-${ws.items.indexOf(item) + 1}`;
const date = (value: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(value));
const options = (list: Item[], value?: string) => list.map(i => `<option value="${i.id}" ${i.id === value ? "selected" : ""}>${esc(i.title)}</option>`).join("");
const commandButton = (icon: IconRenderer, label: string, action: string, symbol?: string, extra = "") => `<button type="button" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ""}${label}</button>`;
const activeEpics = (ws: Workspace) => ws.items.filter(i => i.kind === "epic" && !i.archived);
const within = (ws: Workspace, item: Item, key: string) => {
  let parent = item.parentId;
  while (parent) {
    if (parent === key) return true;
    parent = itemBy(ws, parent)?.parentId;
  }
  return false;
};
/** `#etiqueta` tokens must all be present; the rest of the query is matched as text. */
export const matchesQuery = (item: Item, query = "", labels: string[] = []) => {
  const tokens = query.split(/\s+/).filter(Boolean);
  const required = [...labels, ...tokens.filter(t => t.startsWith("#") && t.length > 1).map(t => t.slice(1).toLocaleLowerCase())];
  if (required.some(label => !item.labels?.includes(label))) return false;
  const textQuery = tokens.filter(t => !t.startsWith("#") || t.length === 1).join(" ");
  return !textQuery || `${item.title} ${item.summary} ${plain(item.content)}`.toLocaleLowerCase().includes(textQuery.toLocaleLowerCase());
};
/** Labels take one of eight host-themeable tones (--planning-label-1…8), chosen by hash. */
export const labelTone = (label: string) => [...label].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 8, 7) + 1;
export const labelChip = (label: string) => `<span class="label-chip" data-label="${esc(label)}" style="--label-tone: var(--planning-label-${labelTone(label)})">${esc(label)}</span>`;
export const labelsMarkup = (labels: string[] | undefined) => labels?.length ? `<span class="label-list">${labels.map(labelChip).join("")}</span>` : "";
export const designName = (ref: DesignRef) => ref.name || ref.screen;
export type AssetResolver = (path: string) => string | undefined;

export function cardMarkup(ws: Workspace, item: Item, icon: IconRenderer = defaultIcon) {
  const parent = item.parentId ? itemBy(ws, item.parentId) : undefined;
  const remaining = blockers(ws, item);
  const docs = ws.relations.filter(r => r.source === item.id && r.type === "modifies").map(r => itemBy(ws, r.target));
  const children = descendants(ws, item.id);
  return `<article class="work-card" draggable="true" data-drag="${esc(item.id)}"><button class="card-main" data-open="${esc(item.id)}" aria-label="Abrir ${esc(item.title)}"><span class="card-meta"><span>${icon(item.kind)}${kindLabels[item.kind]}</span><span>${shortId(ws, item)}</span></span><strong>${esc(item.title)}</strong>${item.summary ? `<p>${esc(item.summary)}</p>` : ""}${labelsMarkup(item.labels)}${remaining.length ? `<span class="dependency">${icon("link")}${remaining.length} dependencia${remaining.length === 1 ? "" : "s"} pendiente${remaining.length === 1 ? "" : "s"}</span>` : ""}${parent ? `<span class="epic-chip">${icon("epic")}${esc(parent.title)}</span>` : ""}<span class="card-footer"><span>${icon("task")}${item.criteria.filter(c => c.checked).length}/${item.criteria.length}${children.length ? ` · ${children.filter(i => i.status === "done").length}/${children.length} subtareas` : ""}</span>${docs.length ? `<span class="${docs.some(d => d.freshness !== "current") ? "pending" : "current"}">${icon("document")}${docs.some(d => d.freshness !== "current") ? "Revisar" : "Vigente"}</span>` : ""}${item.design?.length ? `<span class="design-badge" data-open-design="0" title="${esc(item.design.map(d => `${d.file}#${d.screen}`).join("\n"))}">${icon("design")}${item.design.length === 1 ? esc(designName(item.design[0])) : `${item.design.length} pantallas`}</span>` : ""}${item.priority === "high" ? '<span class="high">Alta</span>' : ""}</span></button></article>`;
}
export function boardMarkup(ws: Workspace, items: Item[], icon: IconRenderer = defaultIcon) {
  return `<div class="board-grid">${statuses.map(([status, label]) => {
    const list = items.filter(i => i.status === status);
    return `<section class="board-column" data-drop="${status}" aria-label="${label}"><header><span class="status-dot ${status}"></span><h2>${label}</h2><span class="count">${list.length}</span><button class="icon-button" data-new-status="${status}" aria-label="Añadir en ${label}">${icon("new")}</button></header><div class="card-list">${list.map(item => cardMarkup(ws, item, icon)).join("")}</div>${list.length ? "" : `<div class="drop-hint">Sin tarjetas</div>`}<button class="column-add" data-new-status="${status}">${icon("new")}Añadir tarjeta</button></section>`;
  }).join("")}</div>`;
}
export type BoardViewState = { query?: string; epicFilter?: string; /** Every label must be present on the card. */ labels?: string[]; /** Defaults to workspace.settings.board. */ groupBy?: "status" | "epics"; /** Epic filter and card count above the columns. Defaults to true. */ filter?: boolean };
/** Board with its epic filter, welcome note and optional grouping by epic. */
export function boardViewMarkup(ws: Workspace, state: BoardViewState = {}, icon: IconRenderer = defaultIcon) {
  const epicFilter = state.epicFilter ?? "all";
  const items = ws.items.filter(i => !i.archived && ["idea", "story", "task"].includes(i.kind) && matchesQuery(i, state.query, state.labels) && (epicFilter === "all" || within(ws, i, epicFilter)));
  return `${!ws.exampleDismissed ? `<div class="welcome-note">${icon("lightbulb")}<span>Este espacio incluye ejemplos editables. Añade tus ideas o archiva los ejemplos cuando quieras.</span><button class="icon-button" data-action="dismiss-welcome" aria-label="Cerrar bienvenida">${icon("close")}</button></div>` : ""}${state.filter === false ? "" : `<div class="board-filter"><label>Épica <select id="epic-filter"><option value="all">Todas</option>${options(activeEpics(ws), epicFilter)}</select></label><span class="muted">${items.length} tarjetas</span></div>`}${
    (state.groupBy ?? ws.settings.board) === "status"
      ? boardMarkup(ws, items, icon)
      : [...activeEpics(ws), { id: "none", title: "Sin épica" }].map(epic => {
          const children = items.filter(i => epic.id === "none" ? !ws.items.some(p => p.kind === "epic" && within(ws, i, p.id)) : within(ws, i, epic.id));
          if (!children.length) return "";
          return `<details class="epic-group" open><summary>${icon("epic")}${esc(epic.title)}<span class="muted">${children.filter(i => i.status === "done").length}/${children.length}</span></summary>${boardMarkup(ws, children, icon)}</details>`;
        }).join("")
  }`;
}
export function knowledgeListMarkup(ws: Workspace, query = "", icon: IconRenderer = defaultIcon) {
  const items = ws.items.filter(i => !i.archived && i.kind === "knowledge" && matchesQuery(i, query));
  return `<div class="section-intro"><p>El comportamiento del producto y las decisiones que siguen vigentes.</p>${commandButton(icon, "Nueva ficha", "new-knowledge", "new")}</div><div class="document-grid">${items.map(i => `<button class="document-card" data-open="${i.id}"><div class="document-card-top">${icon("document")}<span class="badge ${i.freshness === "current" ? "current" : "pending"}">${i.freshness === "current" ? "Vigente" : i.freshness === "draft" ? "Borrador" : "Por revisar"}</span></div><h2>${esc(i.title)}</h2><p>${esc(i.summary || plain(i.content).slice(0, 140))}</p>${i.file ? `<code class="document-file" data-open-file="${esc(i.file)}" title="Abrir ${esc(i.file)}">${esc(i.file)}</code>` : ""}<footer>Revisión ${i.revision}<span>${neighbors(ws, i.id).length} relaciones · ${date(i.updatedAt)}</span></footer></button>`).join("") || '<div class="empty">Crea una ficha para conservar lo que sabe tu producto.</div>'}</div>`;
}
export function archiveMarkup(ws: Workspace, query = "", icon: IconRenderer = defaultIcon) {
  return `<div class="section-intro"><p>El archivo conserva contenido, relaciones e historial.</p></div><div class="item-list">${ws.items.filter(i => i.archived && matchesQuery(i, query)).map(i => `<div class="item-row"><button data-open="${i.id}">${icon(i.kind)}<span>${esc(i.title)}<small>${kindLabels[i.kind]}</small></span></button><button data-restore="${i.id}">Restaurar</button></div>`).join("") || '<div class="empty">No hay elementos archivados.</div>'}</div>`;
}
export function deliveriesMarkup(ws: Workspace, icon: IconRenderer = defaultIcon) {
  return `<div class="section-intro"><p>Resultados verificados y revisiones documentales de cada entrega.</p>${commandButton(icon, "Registrar entrega", "new-delivery", "new")}</div>${ws.deliveries.map(d => `<section class="delivery-card"><header>${icon("deliveries")}<h2>${esc(d.title)}</h2><span class="muted">${date(d.at)}</span></header><p>${esc(d.notes)}</p>${d.items.map(key => {
    const i = itemBy(ws, key);
    return i ? `<button class="delivery-item" data-open="${key}">${icon("verified")}${esc(i.title)}${icon("right")}</button>` : "";
  }).join("")}<footer>${d.documents.map(doc => `<button class="text-button" data-open="${doc.id}">${esc(itemBy(ws, doc.id)?.title)} · r${doc.revision}</button>`).join("")}</footer></section>`).join("") || '<div class="empty">Tus entregas aparecerán aquí cuando verifiques el trabajo y su documentación.</div>'}`;
}
export function criteriaMarkup(item: Item, icon: IconRenderer = defaultIcon) {
  return `<section class="criteria"><h3>Criterios de aceptación <span class="muted">${item.criteria.filter(c => c.checked).length}/${item.criteria.length}</span></h3>${item.criteria.map(c => `<div class="criterion"><input type="checkbox" aria-label="Cumplido: ${esc(c.text)}" data-check="${c.id}" ${c.checked ? "checked" : ""}><input class="plain-input" data-criterion-text="${c.id}" value="${esc(c.text)}" aria-label="Texto del criterio"><button class="icon-button" data-remove-criterion="${c.id}" aria-label="Quitar criterio">${icon("close")}</button></div>`).join("")}<button class="text-button" data-action="add-criterion">${icon("new")}Añadir criterio</button></section>`;
}
export function relationsMarkup(ws: Workspace, item: Item, icon: IconRenderer = defaultIcon) {
  const links = neighbors(ws, item.id);
  return `<section><div class="section-heading"><h3>Relaciones</h3>${commandButton(icon, "Vincular", "link", "new")}</div>${links.map(n => `<div class="relation-row"><button data-open="${n.item!.id}">${icon(n.item!.kind)}<span><small>${n.direction === "in" ? "←" : "→"} ${n.relation === "depends" ? "Depende de" : n.relation === "modifies" ? "Modifica" : "Consulta"}</small>${esc(n.item!.title)}</span>${icon("right")}</button><button class="icon-button remove-link" data-remove-link="${n.id}" aria-label="Quitar vínculo con ${esc(n.item!.title)}">${icon("close")}</button></div>`).join("") || '<p class="muted">Vincula dependencias y conocimiento relevante.</p>'}</section>`;
}
/** Breadcrumb, title and summary of an open item. */
export function itemHeaderMarkup(ws: Workspace, item: Item, icon: IconRenderer = defaultIcon) {
  const parent = item.parentId ? itemBy(ws, item.parentId) : undefined;
  return `<div class="detail-crumb"><button class="text-button" data-action="back">${icon("back")}${item.kind === "knowledge" ? "Conocimiento" : "Tablero"}</button><span>${parent ? esc(parent.title) + " / " : ""}${shortId(ws, item)}</span><button class="icon-button" data-action="archive" title="Archivar" aria-label="Archivar">${icon("archive")}</button></div><input class="document-title" id="item-title" value="${esc(item.title)}" aria-label="Título"><input class="document-summary" id="item-summary" value="${esc(item.summary)}" placeholder="Un resumen breve para la siguiente persona o IA…" aria-label="Resumen">`;
}
export function detailTabs(ws: Workspace, item: Item): [DetailTab, string][] {
  const kids = ws.items.filter(i => i.parentId === item.id && !i.archived);
  return [["content", "Contenido"], ["subtasks", `Subtareas (${kids.length})`], ["context", "Contexto"], ["diagram", "Diagrama"], ...(item.kind === "knowledge" ? [["history", `Historial (${item.history.length})`] as [DetailTab, string]] : [])];
}
export function detailTabsMarkup(ws: Workspace, item: Item, tab: string, tabs: [string, string][] = detailTabs(ws, item)) {
  return `<div class="detail-tabs">${tabs.map(([value, label]) => `<button data-detail-tab="${value}" aria-pressed="${value === tab}">${label}</button>`).join("")}</div>`;
}
/** Revision state of a knowledge document. Empty for work items. */
export function documentStateMarkup(item: Item, icon: IconRenderer = defaultIcon) {
  return item.kind === "knowledge" ? `<div class="document-state ${item.freshness === "current" ? "current" : "pending"}">${icon(item.freshness === "current" ? "verified" : "warning")}<span>${item.freshness === "current" ? `Revisión ${item.revision} vigente` : `Revisión ${item.revision} · ${item.pendingChange ? "cambios sin publicar" : "pendiente de revisión"}`}</span></div>` : "";
}
export function evidenceMarkup(item: Item, icon: IconRenderer = defaultIcon) {
  const knowledge = item.kind === "knowledge";
  return `<section class="evidence"><h3>${knowledge ? "Verificación de la documentación" : "Resultado y verificación"}</h3><textarea id="evidence" aria-label="Resultado y verificación" placeholder="Qué comprobaste, contra qué versión y dónde está la evidencia…">${esc(item.pendingEvidence ?? item.evidence)}</textarea>${knowledge ? commandButton(icon, "Publicar revisión verificada", "verify-doc", "verified", 'class="primary"') : ""}</section>`;
}
export function subtasksMarkup(ws: Workspace, item: Item, icon: IconRenderer = defaultIcon) {
  const kids = ws.items.filter(i => i.parentId === item.id && !i.archived);
  return `<div class="section-heading"><h3>Trabajo dentro de ${esc(item.title)}</h3>${item.kind !== "knowledge" ? commandButton(icon, item.kind === "epic" ? "Historia" : "Subtarea", "new-subtask", "new") : ""}</div><div class="item-list">${kids.map(k => `<div class="item-row"><button data-open="${k.id}">${icon(k.kind)}<span>${esc(k.title)}<small>${statuses.find(([s]) => s === k.status)?.[1]}</small></span>${icon("right")}</button></div>`).join("") || '<p class="muted">No hay subtareas.</p>'}</div>`;
}
export function contextMarkup(item: Item, icon: IconRenderer = defaultIcon) {
  return `<section class="context-summary"><h3>Contexto para IA</h3><p class="muted">Resumen, relaciones y secciones de esta ficha. Los documentos indican su revisión y vigencia.</p><code>${esc(item.id)}</code><button data-action="copy-context">${icon("copy")}Copiar contexto de esta ficha</button><button data-action="export-item">${icon("export")}Exportar ficha</button></section>`;
}
const statusLabel = (status?: string) => statuses.find(([s]) => s === status)?.[1] ?? status ?? "";
const activityText = (entry: NonNullable<Item["activity"]>[number]) => ({
  status: `Estado: ${statusLabel(entry.from)} → ${statusLabel(entry.to)}`, update: `Editó ${(entry.fields ?? []).map(f => ({ design: "diseño", labels: "etiquetas", criteria: "criterios", file: "archivo" })[f] ?? f).join(", ")}`,
  archive: "Archivó la ficha", restore: "Restauró la ficha", link: `Vinculó (${entry.note})`, unlink: `Desvinculó (${entry.note})`,
}[entry.op] ?? entry.op);
/** Published revisions and the activity log, newest first. */
export function historyMarkup(item: Item, icon: IconRenderer = defaultIcon) {
  const rows = [
    ...item.history.map((r, index) => ({ at: r.at, html: `<button data-history="${index}">${icon("document")}<span>Revisión ${r.revision}<small>${date(r.at)} · ${esc(r.summary || "Versión anterior")}</small></span>${icon("right")}</button>` })),
    ...(item.activity ?? []).map(entry => ({ at: entry.at, html: `<div class="activity-row">${icon(entry.op === "status" ? "refresh" : entry.op === "archive" ? "archive" : entry.op === "link" || entry.op === "unlink" ? "link" : "edit")}<span>${esc(activityText(entry))}<small>${date(entry.at)}${entry.actor ? ` · ${esc(entry.actor)}` : ""}${entry.op === "status" && entry.note ? ` · ${esc(entry.note)}` : ""}</small></span></div>` })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return `<div class="history-list">${rows.map(r => r.html).join("") || '<p class="muted">Las revisiones publicadas y la actividad de la ficha aparecerán aquí.</p>'}</div>`;
}
/** Properties panel. Pass relations: false to place mountRelations elsewhere. */
export function designMarkup(item: Item, icon: IconRenderer = defaultIcon, resolveAsset?: AssetResolver) {
  if (!item.design?.length) return "";
  return `<section class="design-list"><div class="section-heading"><h3>Diseño</h3></div>${item.design.map((ref, index) => {
    const image = ref.image ? resolveAsset?.(ref.image) : undefined;
    return `<button class="design-link" data-open-design="${index}" title="${esc(ref.file)}#${esc(ref.screen)}">${image ? `<img class="design-thumb" src="${esc(image)}" alt="">` : icon("design")}<span>${esc(designName(ref))}<small>${esc(ref.file)}#${esc(ref.screen)}</small></span>${icon("right")}</button>`;
  }).join("")}</section>`;
}
export function propertiesMarkup(ws: Workspace, item: Item, icon: IconRenderer = defaultIcon, relations = true, resolveAsset?: AssetResolver) {
  const knowledge = item.kind === "knowledge";
  return `<aside class="inspector"><h3>Propiedades</h3><label>Tipo<span>${icon(item.kind)}${kindLabels[item.kind]}</span></label>${!knowledge ? `<label>Estado<select id="item-status">${statuses.map(([s, l]) => `<option value="${s}" ${s === item.status ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>Prioridad<select id="item-priority"><option value="normal">Normal</option><option value="high" ${item.priority === "high" ? "selected" : ""}>Alta</option></select></label>` : `<label>Revisión<span>${item.revision}</span></label>`}${
    ["story", "task"].includes(item.kind)
      ? `<label>${item.kind === "story" ? "Épica" : "Historia"}<select id="item-parent"><option value="">Sin asignar</option>${options(ws.items.filter(i => !i.archived && i.id !== item.id && (item.kind === "story" ? i.kind === "epic" : ["story", "task"].includes(i.kind) && !descendants(ws, item.id).some(child => child.id === i.id))), item.parentId)}</select></label>`
      : ""
  }<label>Actualizado<span>${date(item.updatedAt)}</span></label>${item.labels?.length ? `<label>Etiquetas${labelsMarkup(item.labels)}</label>` : ""}${item.file ? `<label>Archivo<code class="document-file" data-open-file="${esc(item.file)}">${esc(item.file)}</code></label>` : ""}${designMarkup(item, icon, resolveAsset)}${relations ? relationsMarkup(ws, item, icon) : ""}${item.archived ? `<div class="document-state pending">Este elemento está archivado.</div><button data-restore="${item.id}">Restaurar</button>` : ""}</aside>`;
}
export type SidebarSection = "search" | "views" | "epics" | "status";
export const sidebarSections: SidebarSection[] = ["views", "epics", "status"];
export const sidebarViews: View[] = ["board", "knowledge", "deliveries", "graph", "archive"];
export type SidebarState = {
  view?: View;
  epicFilter?: string;
  saveLabel?: string;
  saveError?: boolean;
  /** Current search text. Only shown when "search" is in sections. */
  query?: string;
  /** Sections and their order. Default: ["views", "epics", "status"]. A section left out is not rendered. */
  sections?: SidebarSection[];
  /** Views inside «Espacio» and their order. Default: all five. A view left out is not rendered. */
  views?: View[];
  /** Sections with a disclosure control (open at first). */
  collapsible?: SidebarSection[];
  /** Sections with a disclosure control that start closed. */
  collapsed?: SidebarSection[];
  /** Host elements appended at the end of a section, e.g. { views: myDocumentTree }. Adopted as they are, never cloned. */
  slots?: Partial<Record<SidebarSection, HTMLElement>>;
};
export function sidebarMarkup(ws: Workspace, state: SidebarState = {}, icon: IconRenderer = defaultIcon) {
  const { view = "board", epicFilter = "all", saveLabel = "Guardado localmente", saveError = false, query = "", sections = sidebarSections, views = sidebarViews, collapsible = [], collapsed = [], slots = {} } = state;
  const section = (name: SidebarSection, label: string, body: string) => {
    const slot = slots[name] ? `<div class="sidebar-slot" data-slot="${name}"></div>` : "";
    // Sections without a heading have nothing to click on, so they never collapse.
    if (!label || (!collapsible.includes(name) && !collapsed.includes(name))) return `${label}${body}${slot}`;
    return `<details class="sidebar-section" data-section="${name}"${collapsed.includes(name) ? "" : " open"}>${label.replace(/^<div/, "<summary").replace(/<\/div>$/, "</summary>")}${body}${slot}</details>`;
  };
  const parts: Record<SidebarSection, () => string> = {
    search: () => section("search", "", `<label class="search-field">${icon("search")}<input data-search placeholder="Buscar" aria-label="Buscar" value="${esc(query)}"></label>`),
    views: () => section("views", `<div class="sidebar-section-label">Espacio</div>`, views.map(v => `<button class="sidebar-item ${view === v ? "selected" : ""}" data-view="${v}">${icon(v)}<span>${viewTitles[v]}</span>${v === "knowledge" ? `<small>${ws.items.filter(i => i.kind === "knowledge" && !i.archived).length}</small>` : ""}</button>`).join("")),
    epics: () => section("epics", `<div class="sidebar-section-label section-split"><span>Épicas</span><button class="icon-button" data-new-kind="epic" aria-label="Nueva épica">${icon("new")}</button></div>`, `${activeEpics(ws).map(e => `<div class="sidebar-epic"><button data-filter-epic="${e.id}" class="sidebar-item ${epicFilter === e.id ? "epic-selected" : ""}">${icon("epic")}<span>${esc(e.title)}</span></button><button class="epic-open" data-open="${e.id}" aria-label="Abrir épica ${esc(e.title)}">${icon("right")}</button></div>`).join("")}${ws.draft ? `<button class="sidebar-item draft-item" data-action="new">${icon("edit")}Borrador sin terminar</button>` : ""}`),
    status: () => section("status", "", `<div class="sidebar-spacer"></div><div class="local-status">${icon(saveError ? "warning" : "verified")}<span id="save-label">${esc(saveLabel)}</span></div><button id="recover-storage" data-action="recover-storage" style="display:${saveError ? "block" : "none"}">Exportar copia y recargar</button>`),
  };
  return `<aside class="sidebar">${sections.map(name => parts[name]()).join("")}</aside>`;
}
export type WindowToolbarState = { subtitle?: string; query?: string };
export function windowToolbarMarkup(ws: Workspace, state: WindowToolbarState = {}, icon: IconRenderer = defaultIcon) {
  return `<header class="window-toolbar" data-tauri-drag-region><div class="toolbar-leading"><button class="icon-button" data-action="toggle-sidebar" aria-label="Mostrar u ocultar barra lateral" title="Barra lateral ⇧⌘L">${icon("sidebar")}</button><div class="window-title" data-tauri-drag-region><strong>${esc(ws.name)}</strong><span>${esc(state.subtitle ?? "")}</span></div></div><div class="toolbar-trailing"><label class="search-field">${icon("search")}<input id="search" placeholder="Buscar" aria-label="Buscar" value="${esc(state.query ?? "")}"><kbd>⌘F</kbd></label><button class="icon-button" data-action="new" aria-label="${ws.draft ? "Continuar borrador" : "Nueva tarjeta"}" title="Nueva tarjeta ⌘N">${icon("new")}</button><button class="icon-button" data-action="settings" aria-label="Configuración" title="Configuración ⌘,">${icon("settings")}</button></div></header>`;
}
/** Title of a view, the board grouping switch and the "new card" menu. */
export function viewToolbarMarkup(ws: Workspace, view: View, icon: IconRenderer = defaultIcon) {
  return `<div class="view-toolbar"><h1>${viewTitles[view]}</h1>${view === "board" ? `<div class="segmented"><button data-board="status" aria-pressed="${ws.settings.board === "status"}">Estados</button><button data-board="epics" aria-pressed="${ws.settings.board === "epics"}">Épicas</button></div>` : ""}<div class="toolbar-space"></div>${view === "board" ? `<details class="create-menu"><summary>${icon("new")}Nueva tarjeta</summary><div class="menu-popover">${(["idea", "story", "task", "epic", "knowledge"] as Kind[]).map(kind => `<button data-new-kind="${kind}">${icon(kind)}${kindLabels[kind]}</button>`).join("")}</div></details>` : ""}</div>`;
}

/* ───────── Components ─────────
 * Controlled: they render what they are given and emit intents. The host
 * validates, applies and persists the change, then calls update(). A control
 * whose callback is not provided is hidden or disabled. */

export type Component<T> = { readonly element: HTMLElement; update: (options: Partial<T>) => void; destroy: () => void };
type Common = { icon?: IconRenderer; /** Extra class names for the root element. */ className?: string };
type Binder = { root: HTMLElement; all: <E extends HTMLElement = HTMLElement>(selector: string) => E[]; one: <E extends HTMLElement = HTMLElement>(selector: string) => E | null; click: (selector: string, handler: ((element: HTMLElement) => void) | undefined, read?: boolean) => void };
const focusKey = (element: HTMLElement | null) => !element ? undefined : element.id ? `#${element.id}` : element.dataset.check ? `[data-check="${element.dataset.check}"]` : element.dataset.criterionText ? `[data-criterion-text="${element.dataset.criterionText}"]` : undefined;
function component<T extends Common>(host: HTMLElement, initial: T, markup: (options: T) => string, bind: (binder: Binder, options: T) => void): Component<T> {
  const root = document.createElement("div");
  host.append(root);
  let current = initial, alive = true, last: string | undefined;
  const all = <E extends HTMLElement>(selector: string) => [...root.querySelectorAll<E>(selector)];
  const binder: Binder = {
    root, all, one: selector => root.querySelector(selector),
    click(selector, handler, read = false) {
      for (const element of all(selector)) {
        if (handler) element.onclick = () => handler(element);
        else if (read) (element as HTMLButtonElement).disabled = true;
        else element.hidden = true;
      }
    },
  };
  const render = () => {
    root.className = `codaru-planning planning-components${current.className ? ` ${current.className}` : ""}`;
    const html = markup(current);
    if (html !== last) {
      // Keep the caret when a host re-renders in response to typing.
      const active = root.contains(document.activeElement) ? document.activeElement as HTMLInputElement : null;
      const key = focusKey(active), start = active?.selectionStart, end = active?.selectionEnd;
      root.innerHTML = last = html;
      const restored = key ? root.querySelector<HTMLInputElement>(key) : null;
      if (restored) { restored.focus(); if (start != null && end != null) try { restored.setSelectionRange(start, end); } catch { /* not a text control */ } }
    }
    bind(binder, current);
  };
  render();
  return { element: root, update(options) { if (!alive) return; current = { ...current, ...options }; render(); }, destroy() { alive = false; root.remove(); } };
}
const text = (binder: Binder, selector: string, handler: ((value: string) => void) | undefined, event: "input" | "change" = "input") => {
  const control = binder.one<HTMLInputElement>(selector);
  if (!control) return;
  if (!handler) { if (control.tagName === "SELECT") control.disabled = true; else control.readOnly = true; return; }
  control[event === "input" ? "oninput" : "onchange"] = () => handler(control.value);
};

type DesignIntent = { /** The host opens the design file at that screen. */ onOpenDesign?: (ref: DesignRef, itemId: string) => void };
/** Design badges sit inside the card button: they open the design without opening the card. */
function bindDesign(b: Binder, o: DesignIntent & { workspace: Workspace }, item?: Item) {
  for (const badge of b.all("[data-open-design]")) {
    const owner = item ?? o.workspace.items.find(i => i.id === badge.closest<HTMLElement>("[data-drag], [data-open]")?.dataset.drag || i.id === badge.closest<HTMLElement>("[data-open]")?.dataset.open);
    const ref = owner?.design?.[Number(badge.dataset.openDesign)];
    if (!o.onOpenDesign || !ref) { if (badge.tagName === "BUTTON") (badge as HTMLButtonElement).disabled = true; continue; }
    badge.onclick = event => { event.stopPropagation(); event.preventDefault(); o.onOpenDesign!(ref, owner!.id); };
  }
}
type FileIntent = { /** The host opens the file that backs a knowledge item. */ onOpenFile?: (path: string, itemId: string) => void };
function bindFile(b: Binder, o: FileIntent, itemId?: string) {
  for (const code of b.all("[data-open-file]")) {
    const id = itemId ?? code.closest<HTMLElement>("[data-open]")?.dataset.open;
    if (!o.onOpenFile || !id) continue;
    code.setAttribute("role", "link"); code.tabIndex = 0;
    code.onclick = event => { event.stopPropagation(); event.preventDefault(); o.onOpenFile!(code.dataset.openFile!, id); };
  }
}
export type CardOptions = Common & DesignIntent & { workspace: Workspace; item: Item; onOpen?: (id: string) => void };
export function mountCard(host: HTMLElement, options: CardOptions) {
  return component(host, options, o => cardMarkup(o.workspace, o.item, o.icon), (b, o) => {
    b.one("article")!.draggable = false;
    b.click("[data-open]", o.onOpen && (() => o.onOpen!(o.item.id)), true);
    bindDesign(b, o, o.item);
  });
}
function bindBoard(b: Binder, o: { workspace: Workspace; onOpen?: (id: string) => void; onCreate?: (status: Status) => void; onStatusChange?: (id: string, status: Status) => void }) {
  b.click("[data-open]", o.onOpen && (e => o.onOpen!(e.dataset.open!)), true);
  b.click("[data-new-status]", o.onCreate && (e => o.onCreate!(e.dataset.newStatus as Status)));
  for (const card of b.all("[data-drag]")) {
    card.draggable = !!o.onStatusChange;
    card.ondragstart = event => { event.dataTransfer!.setData("text/plain", card.dataset.drag!); event.dataTransfer!.effectAllowed = "move"; card.classList.add("dragging"); };
    card.ondragend = () => card.classList.remove("dragging");
  }
  for (const column of b.all("[data-drop]")) {
    column.ondragover = event => { if (!o.onStatusChange) return; event.preventDefault(); column.classList.add("drag-over"); };
    column.ondragleave = event => { if (!column.contains(event.relatedTarget as Node)) column.classList.remove("drag-over"); };
    column.ondrop = event => {
      event.preventDefault(); column.classList.remove("drag-over");
      const id = event.dataTransfer!.getData("text/plain");
      if (o.onStatusChange && o.workspace.items.some(i => i.id === id)) o.onStatusChange(id, column.dataset.drop as Status);
    };
  }
}
export type BoardOptions = Common & DesignIntent & {
  workspace: Workspace;
  labels?: string[];
  /** Columns only, with exactly these items. Omit to get the full board view with filter and grouping. */
  items?: Item[];
  query?: string; epicFilter?: string; groupBy?: "status" | "epics"; filter?: boolean;
  onOpen?: (id: string) => void;
  onCreate?: (status: Status) => void;
  /** Fired when a card is dropped on a column. The board never changes the status by itself. */
  onStatusChange?: (id: string, status: Status) => void;
  onEpicFilter?: (epicId: string) => void;
  onDismissWelcome?: () => void;
};
export function mountBoard(host: HTMLElement, options: BoardOptions) {
  return component(host, options, o => o.items ? boardMarkup(o.workspace, o.items, o.icon) : boardViewMarkup(o.workspace, o, o.icon), (b, o) => {
    bindBoard(b, o);
    bindDesign(b, o);
    text(b, "#epic-filter", o.onEpicFilter, "change");
    b.click('[data-action="dismiss-welcome"]', o.onDismissWelcome && (() => o.onDismissWelcome!()));
  });
}
export type KnowledgeListOptions = Common & FileIntent & { workspace: Workspace; query?: string; onOpen?: (id: string) => void; onCreate?: () => void };
export function mountKnowledgeList(host: HTMLElement, options: KnowledgeListOptions) {
  return component(host, options, o => knowledgeListMarkup(o.workspace, o.query, o.icon), (b, o) => {
    b.click("[data-open]", o.onOpen && (e => o.onOpen!(e.dataset.open!)), true);
    bindFile(b, o);
    b.click('[data-action="new-knowledge"]', o.onCreate && (() => o.onCreate!()));
  });
}
export type ArchiveOptions = Common & { workspace: Workspace; query?: string; onOpen?: (id: string) => void; onRestore?: (id: string) => void };
export function mountArchive(host: HTMLElement, options: ArchiveOptions) {
  return component(host, options, o => archiveMarkup(o.workspace, o.query, o.icon), (b, o) => {
    b.click("[data-open]", o.onOpen && (e => o.onOpen!(e.dataset.open!)), true);
    b.click("[data-restore]", o.onRestore && (e => o.onRestore!(e.dataset.restore!)));
  });
}
export type DeliveriesOptions = Common & { workspace: Workspace; onOpen?: (id: string) => void; onCreate?: () => void };
export function mountDeliveries(host: HTMLElement, options: DeliveriesOptions) {
  return component(host, options, o => deliveriesMarkup(o.workspace, o.icon), (b, o) => {
    b.click("[data-open]", o.onOpen && (e => o.onOpen!(e.dataset.open!)), true);
    b.click('[data-action="new-delivery"]', o.onCreate && (() => o.onCreate!()));
  });
}
function bindCriteria(b: Binder, o: { readOnly?: boolean; onToggle?: (id: string, checked: boolean) => void; onEdit?: (id: string, text: string) => void; onRemove?: (id: string) => void; onAdd?: () => void }) {
  const locked = !!o.readOnly;
  for (const box of b.all<HTMLInputElement>("[data-check]")) {
    box.disabled = locked || !o.onToggle;
    // The host decides: the box returns to the rendered value until update() says otherwise.
    box.onchange = () => { const checked = box.checked; box.checked = !checked; o.onToggle?.(box.dataset.check!, checked); };
  }
  for (const input of b.all<HTMLInputElement>("[data-criterion-text]")) {
    input.readOnly = locked || !o.onEdit;
    input.oninput = () => o.onEdit?.(input.dataset.criterionText!, input.value);
  }
  b.click("[data-remove-criterion]", !locked && o.onRemove ? e => o.onRemove!(e.dataset.removeCriterion!) : undefined);
  b.click('[data-action="add-criterion"]', !locked && o.onAdd ? () => o.onAdd!() : undefined);
}
export type CriteriaOptions = Common & { item: Item; readOnly?: boolean; onToggle?: (id: string, checked: boolean) => void; onEdit?: (id: string, text: string) => void; onRemove?: (id: string) => void; onAdd?: () => void };
export function mountCriteria(host: HTMLElement, options: CriteriaOptions) {
  return component(host, options, o => criteriaMarkup(o.item, o.icon), bindCriteria);
}
type RelationIntents = { onOpen?: (id: string) => void; /** Opens the host's own "link" dialog. */ onLink?: () => void; onUnlink?: (relationId: string) => void };
function bindRelations(b: Binder, o: RelationIntents) {
  b.click(".relation-row [data-open]", o.onOpen && (e => o.onOpen!(e.dataset.open!)), true);
  b.click('[data-action="link"]', o.onLink && (() => o.onLink!()));
  b.click("[data-remove-link]", o.onUnlink && (e => o.onUnlink!(e.dataset.removeLink!)));
}
export type RelationsOptions = Common & RelationIntents & { workspace: Workspace; item: Item };
export function mountRelations(host: HTMLElement, options: RelationsOptions) {
  return component(host, options, o => relationsMarkup(o.workspace, o.item, o.icon), bindRelations);
}
export type ItemHeaderOptions = Common & { workspace: Workspace; item: Item; onBack?: () => void; onArchive?: () => void; onTitle?: (title: string) => void; onSummary?: (summary: string) => void };
export function mountItemHeader(host: HTMLElement, options: ItemHeaderOptions) {
  return component(host, options, o => itemHeaderMarkup(o.workspace, o.item, o.icon), (b, o) => {
    b.click('[data-action="back"]', o.onBack && (() => o.onBack!()));
    b.click('[data-action="archive"]', o.onArchive && (() => o.onArchive!()));
    text(b, "#item-title", o.onTitle && (value => { if (value.trim()) o.onTitle!(value.trim()); }));
    text(b, "#item-summary", o.onSummary);
  });
}
export type DetailTabsOptions = Common & { workspace: Workspace; item: Item; tab: string; /** Replace or reorder the tabs: [value, label]. */ tabs?: [string, string][]; onTab?: (tab: string) => void };
export function mountDetailTabs(host: HTMLElement, options: DetailTabsOptions) {
  return component(host, options, o => detailTabsMarkup(o.workspace, o.item, o.tab, o.tabs), (b, o) => {
    b.click("[data-detail-tab]", o.onTab && (e => o.onTab!(e.dataset.detailTab!)), true);
  });
}
export type DocumentStateOptions = Common & { item: Item };
export function mountDocumentState(host: HTMLElement, options: DocumentStateOptions) {
  return component(host, options, o => documentStateMarkup(o.item, o.icon), () => {});
}
export type EvidenceOptions = Common & { item: Item; onChange?: (evidence: string) => void; /** Knowledge only: publish the verified revision. */ onPublish?: () => void };
export function mountEvidence(host: HTMLElement, options: EvidenceOptions) {
  return component(host, options, o => evidenceMarkup(o.item, o.icon), (b, o) => {
    text(b, "#evidence", o.onChange);
    b.click('[data-action="verify-doc"]', o.onPublish && (() => o.onPublish!()));
  });
}
export type SubtasksOptions = Common & { workspace: Workspace; item: Item; onOpen?: (id: string) => void; onCreate?: () => void };
export function mountSubtasks(host: HTMLElement, options: SubtasksOptions) {
  return component(host, options, o => subtasksMarkup(o.workspace, o.item, o.icon), (b, o) => {
    b.click("[data-open]", o.onOpen && (e => o.onOpen!(e.dataset.open!)), true);
    b.click('[data-action="new-subtask"]', o.onCreate && (() => o.onCreate!()));
  });
}
export type ContextOptions = Common & { item: Item; onCopy?: () => void; onExport?: () => void };
export function mountContext(host: HTMLElement, options: ContextOptions) {
  return component(host, options, o => contextMarkup(o.item, o.icon), (b, o) => {
    b.click('[data-action="copy-context"]', o.onCopy && (() => o.onCopy!()));
    b.click('[data-action="export-item"]', o.onExport && (() => o.onExport!()));
  });
}
export type HistoryOptions = Common & { item: Item; onOpenRevision?: (index: number) => void };
export function mountHistory(host: HTMLElement, options: HistoryOptions) {
  return component(host, options, o => historyMarkup(o.item, o.icon), (b, o) => {
    b.click("[data-history]", o.onOpenRevision && (e => o.onOpenRevision!(Number(e.dataset.history))), true);
  });
}
export type PropertiesOptions = Common & RelationIntents & DesignIntent & FileIntent & {
  workspace: Workspace; item: Item;
  /** Turns a design `image` path into a URL for the thumbnail. Without it no thumbnail is shown. */
  resolveAsset?: AssetResolver;
  /** false leaves relations out so mountRelations can live elsewhere. */
  relations?: boolean;
  /** The select returns to the rendered value until the host calls update(). */
  onStatus?: (status: Status) => void;
  onPriority?: (priority: "normal" | "high") => void;
  onParent?: (parentId: string | undefined) => void;
  onRestore?: () => void;
};
export function mountProperties(host: HTMLElement, options: PropertiesOptions) {
  return component(host, options, o => propertiesMarkup(o.workspace, o.item, o.icon, o.relations !== false, o.resolveAsset), (b, o) => {
    bindDesign(b, o, o.item); bindFile(b, o, o.item.id);
    const controlled = <V extends string>(selector: string, value: string, handler?: (value: V) => void) => text(b, selector, handler && (next => { b.one<HTMLSelectElement>(selector)!.value = value; handler(next as V); }), "change");
    controlled("#item-status", o.item.status, o.onStatus);
    controlled("#item-priority", o.item.priority, o.onPriority);
    controlled("#item-parent", o.item.parentId ?? "", o.onParent && (value => o.onParent!(value || undefined)));
    bindRelations(b, o);
    b.click("[data-restore]", o.onRestore && (() => o.onRestore!()));
  });
}
export type SidebarOptions = Common & SidebarState & {
  workspace: Workspace;
  onView?: (view: View) => void;
  onFilterEpic?: (epicId: string) => void;
  onOpen?: (id: string) => void;
  onNewEpic?: () => void;
  onDraft?: () => void;
  onRecover?: () => void;
  /** Only used by the "search" section. */
  onSearch?: (query: string) => void;
};
export function mountSidebar(host: HTMLElement, options: SidebarOptions) {
  // What the person opened or closed wins over `collapsed` on later updates.
  const toggled = new Map<SidebarSection, boolean>();
  const state = (o: SidebarOptions): SidebarState => {
    const collapsible = [...new Set([...(o.collapsible ?? []), ...(o.collapsed ?? [])])];
    return { ...o, collapsible, collapsed: collapsible.filter(name => toggled.has(name) ? !toggled.get(name) : o.collapsed?.includes(name)) };
  };
  return component(host, options, o => sidebarMarkup(o.workspace, state(o), o.icon), (b, o) => {
    b.click("[data-view]", o.onView && (e => o.onView!(e.dataset.view as View)), true);
    b.click("[data-filter-epic]", o.onFilterEpic && (e => o.onFilterEpic!(e.dataset.filterEpic!)), true);
    b.click("[data-open]", o.onOpen && (e => o.onOpen!(e.dataset.open!)));
    b.click("[data-new-kind]", o.onNewEpic && (() => o.onNewEpic!()));
    b.click('[data-action="new"]', o.onDraft && (() => o.onDraft!()));
    b.click('[data-action="recover-storage"]', o.onRecover && (() => o.onRecover!()));
    const search = b.one<HTMLInputElement>("[data-search]");
    if (search) { search.readOnly = !o.onSearch; search.oninput = () => o.onSearch?.(search.value); }
    for (const details of b.all<HTMLDetailsElement>("details[data-section]")) {
      details.ontoggle = () => toggled.set(details.dataset.section as SidebarSection, details.open);
      // A button inside the summary acts on its own; it must not toggle the section.
      for (const button of details.querySelectorAll<HTMLButtonElement>("summary button")) {
        const action = button.onclick;
        button.onclick = event => { event.preventDefault(); event.stopPropagation(); action?.call(button, event); };
      }
    }
    for (const placeholder of b.all("[data-slot]")) {
      const slot = o.slots?.[placeholder.dataset.slot as SidebarSection];
      if (slot && slot.parentElement !== placeholder) placeholder.append(slot);
    }
  });
}
export type WindowToolbarOptions = Common & WindowToolbarState & { workspace: Workspace; onSearch?: (query: string) => void; onNew?: () => void; onSettings?: () => void; onToggleSidebar?: () => void };
export function mountWindowToolbar(host: HTMLElement, options: WindowToolbarOptions) {
  return component(host, options, o => windowToolbarMarkup(o.workspace, o, o.icon), (b, o) => {
    const search = b.one<HTMLInputElement>("#search")!;
    search.closest<HTMLElement>(".search-field")!.hidden = !o.onSearch;
    search.oninput = () => o.onSearch?.(search.value);
    b.click('[data-action="new"]', o.onNew && (() => o.onNew!()));
    b.click('[data-action="settings"]', o.onSettings && (() => o.onSettings!()));
    b.click('[data-action="toggle-sidebar"]', o.onToggleSidebar && (() => o.onToggleSidebar!()));
  });
}
export type ViewToolbarOptions = Common & { workspace: Workspace; view: View; onBoardMode?: (mode: "status" | "epics") => void; onCreate?: (kind: Kind) => void };
export function mountViewToolbar(host: HTMLElement, options: ViewToolbarOptions) {
  return component(host, options, o => viewToolbarMarkup(o.workspace, o.view, o.icon), (b, o) => {
    b.click("[data-board]", o.onBoardMode && (e => o.onBoardMode!(e.dataset.board as "status" | "epics")), true);
    b.click("[data-new-kind]", o.onCreate && (e => { b.one<HTMLDetailsElement>(".create-menu")!.open = false; o.onCreate!(e.dataset.newKind as Kind); }));
    if (!o.onCreate) { const menu = b.one(".create-menu"); if (menu) menu.hidden = true; }
  });
}
