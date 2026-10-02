import { createBlockEditor, type VisualEditor } from '@fsaldivar.dev/planning/editor';
import {
  mountWindowToolbar, mountSidebar, mountViewToolbar, mountBoard, mountKnowledgeList, mountArchive, mountDeliveries,
  mountItemHeader, mountDetailTabs, mountCriteria, mountEvidence, mountSubtasks, mountRelations, mountContext, mountHistory, mountProperties,
  viewTitles, type View, type Component,
} from '@fsaldivar.dev/planning/components';
import { applyOperations, emptyWorkspace, type Operation, type ItemPatch } from '@fsaldivar.dev/planning';
import '@fsaldivar.dev/planning/editor.css';
import '@fsaldivar.dev/planning/components.css';
import './style.css';

const el = (id: string) => document.getElementById(id)!;
const status = (text: string) => { el('host-status').textContent = text; };

// ── Host state. The pieces never change it: they ask, the host decides.
const seed = applyOperations(emptyWorkspace('Mi espacio'), { expectedRevision: 0, operations: [
  { op: 'create', ref: 'epic', kind: 'epic', title: 'Mi primera entrega' },
  { op: 'create', ref: 'story', kind: 'story', parentId: '@epic', title: 'Definir el resultado', summary: 'Qué cambia para la persona que usa el producto.',
    markdown: '## Qué queremos lograr\n\nEscribe / para insertar un bloque.\n\n## Cómo lo vamos a resolver\n\n```mermaid\nflowchart LR\n  A[Idea] --> B[Entrega]\n  B --> C[Documentación viva]\n```\n',
    criteria: [{ text: 'El resultado se puede comprobar', checked: false }] },
  { op: 'create', ref: 'task', kind: 'task', parentId: '@story', title: 'Escribir los criterios de aceptación' },
  { op: 'create', ref: 'doc', kind: 'knowledge', title: 'Cómo funciona el producto', markdown: '## Qué hace\n\nPendiente de verificar.' },
  { op: 'link', source: '@story', target: '@doc', type: 'modifies' },
] });
let workspace = seed.workspace;
let view: View = 'board', selected: string | undefined, tab = 'content', query = '', epicFilter = 'all';
const item = () => workspace.items.find(i => i.id === selected)!;

function apply(...operations: Operation[]) {
  try {
    workspace = applyOperations(workspace, { expectedRevision: workspace.revision, operations }).workspace;
    workspace.revision++; // In memory. A real host persists through its own versioned storage.
    status(`Revisión ${workspace.revision} · ejemplo en memoria`);
  } catch (error) { status(error instanceof Error ? error.message : String(error)); }
  refresh();
}
const open = (id: string) => { selected = id; tab = 'content'; mountDetail(); refresh(); };
const close = () => { selected = undefined; unmountDetail(); refresh(); };
const todo = (what: string) => () => status(`${what}: aquí tu aplicación abre su propio diálogo.`);

// ── Frame: each piece lives in the slot the host chose.
const toolbar = mountWindowToolbar(el('slot-window-toolbar'), { workspace,
  onSearch(value) { query = value; refresh(); }, onNew: todo('Nueva tarjeta'), onSettings: todo('Configuración'),
  onToggleSidebar() { el('slot-sidebar').hidden = !el('slot-sidebar').hidden; },
});
const sidebar = mountSidebar(el('slot-sidebar'), { workspace,
  onView(next) { view = next; selected = undefined; unmountDetail(); refresh(); },
  onFilterEpic(id) { epicFilter = id; view = 'board'; selected = undefined; unmountDetail(); refresh(); },
  onOpen: open, onNewEpic: todo('Nueva épica'),
});
const viewToolbar = mountViewToolbar(el('slot-view-toolbar'), { workspace, view,
  onBoardMode(board) { apply({ op: 'settings', patch: { board } }); },
  onCreate(kind) { apply({ op: 'create', kind, title: 'Nueva tarjeta' }); },
});

// ── One list at a time in the same slot.
let list: Component<any> | undefined, listView: View | undefined;
function mountList() {
  if (listView === view) return;
  list?.destroy(); listView = view;
  const slot = el('slot-view');
  list = view === 'board' ? mountBoard(slot, { workspace, onOpen: open,
      onCreate() { apply({ op: 'create', kind: 'story', title: 'Nueva historia' }); },
      onStatusChange(id, next) { apply({ op: 'status', id, status: next }); },
      onEpicFilter(id) { epicFilter = id; refresh(); },
      onDismissWelcome() { workspace = { ...workspace, exampleDismissed: true }; refresh(); } })
    : view === 'knowledge' ? mountKnowledgeList(slot, { workspace, onOpen: open, onCreate() { apply({ op: 'create', kind: 'knowledge', title: 'Nueva ficha' }); } })
    : view === 'deliveries' ? mountDeliveries(slot, { workspace, onOpen: open, onCreate: todo('Registrar entrega') })
    : view === 'archive' ? mountArchive(slot, { workspace, onOpen: open, onRestore(id) { apply({ op: 'restore', id }); } })
    : undefined;
  if (!list) slot.textContent = 'El grafo de relaciones se monta con @fsaldivar.dev/diagram.';
  else if (slot.firstChild?.nodeType === Node.TEXT_NODE) slot.firstChild.remove();
}

// ── Detail of one item: header, tabs, editor, criteria, evidence, properties… all separate.
let detail: Component<any>[] = [], editor: VisualEditor | undefined;
function unmountDetail() { detail.forEach(piece => piece.destroy()); detail = []; editor?.destroy(); editor = undefined; }
function mountDetail() {
  unmountDetail();
  const current = item(), id = current.id, knowledge = current.kind === 'knowledge';
  const patch = (value: ItemPatch) => apply({ op: 'update', id, patch: value });
  editor = createBlockEditor(el('slot-editor'), {
    content: current.pendingChange || current.content,
    onChange(content) { apply(knowledge ? { op: 'draft', id, content } : { op: 'update', id, patch: { content } }); },
  });
  const relations = {
    onOpen: open, onLink: todo('Vincular'),
    onUnlink(relationId: string) { const r = workspace.relations.find(r => r.id === relationId)!; apply({ op: 'unlink', source: r.source, target: r.target, type: r.type }); },
  };
  detail = [
    mountItemHeader(el('slot-header'), { workspace, item: current, onBack: close, onArchive() { apply({ op: 'archive', id }); close(); },
      onTitle(title) { patch({ title }); }, onSummary(summary) { patch({ summary }); } }),
    mountDetailTabs(el('slot-tabs'), { workspace, item: current, tab, onTab(next) { tab = next; refresh(); } }),
    ...(knowledge ? [] : [mountCriteria(el('slot-criteria'), { item: current,
      onToggle(key, checked) { patch({ criteria: item().criteria.map(c => c.id === key ? { ...c, checked } : c) }); },
      onEdit(key, text) { patch({ criteria: item().criteria.map(c => c.id === key ? { ...c, text } : c) }); },
      onRemove(key) { patch({ criteria: item().criteria.filter(c => c.id !== key) }); },
      onAdd() { patch({ criteria: [...item().criteria, { text: 'Nuevo criterio', checked: false }] }); } })]),
    mountEvidence(el('slot-evidence'), { item: current, onChange(evidence) { if (!knowledge) patch({ evidence }); },
      onPublish() { apply({ op: 'publish', id, evidence: (document.getElementById('evidence') as HTMLTextAreaElement).value }); } }),
    mountSubtasks(el('slot-subtasks'), { workspace, item: current, onOpen: open,
      onCreate() { apply({ op: 'create', kind: current.kind === 'epic' ? 'story' : 'task', parentId: id, title: 'Nueva subtarea' }); } }),
    mountRelations(el('slot-relations'), { workspace, item: current, ...relations }),
    mountContext(el('slot-context'), { item: current, onCopy() { void navigator.clipboard?.writeText(editor!.getMarkdown()); status('Markdown copiado'); } }),
    mountHistory(el('slot-history'), { item: current, onOpenRevision: index => status(`Revisión ${current.history[index].revision}`) }),
    mountProperties(el('slot-properties'), { workspace, item: current, ...relations,
      onStatus(next) { apply({ op: 'status', id, status: next }); },
      onPriority(priority) { patch({ priority }); },
      onParent(parentId) { patch({ parentId: parentId ?? null }); },
      onRestore() { apply({ op: 'restore', id }); } }),
  ];
}

// ── After every change the host hands the new data to whatever is mounted.
function refresh() {
  const current = selected ? item() : undefined;
  toolbar.update({ workspace, query, subtitle: current ? current.title : viewTitles[view] });
  sidebar.update({ workspace, view, epicFilter });
  el('list-view').hidden = !!current; el('detail-view').hidden = !current;
  if (current) {
    for (const piece of detail) piece.update({ workspace, item: current, tab });
    for (const panel of document.querySelectorAll<HTMLElement>('[data-tab]')) panel.hidden = panel.dataset.tab !== tab;
  } else {
    viewToolbar.update({ workspace, view });
    mountList();
    list?.update({ workspace, query, epicFilter });
  }
}
refresh();

// ── Theme and placement are the host's decision.
el('toggle-theme').onclick = () => { const host = el('host'); host.dataset.theme = host.dataset.theme === 'dark' ? 'light' : 'dark'; };
el('toggle-accent').onclick = () => el('host').classList.toggle('accent');
el('toggle-side').onclick = () => el('host').classList.toggle('properties-left');
