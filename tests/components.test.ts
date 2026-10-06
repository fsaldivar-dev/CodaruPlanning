import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emptyWorkspace, applyOperations } from '@fsaldivar.dev/planning';
let dom: JSDOM;
let ui: typeof import('@fsaldivar.dev/planning/editor');
let components: typeof import('@fsaldivar.dev/planning/components');
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const win = dom.window;
  for (const key of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'MutationObserver', 'getComputedStyle', 'DOMParser', 'Range', 'Option']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: (win as any)[key] });
  }
  globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  win.scrollBy = () => {};
  win.Range.prototype.getClientRects = () => [] as any;
  win.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 10, top: 0, bottom: 10, width: 10, height: 10, x: 0, y: 0, toJSON() {} });
  ui = await import('@fsaldivar.dev/planning/editor');
  components = await import('@fsaldivar.dev/planning/components');
});
after(() => dom.window.close());
const host = () => { const element = document.createElement('div'); document.body.append(element); return element; };

test('public editor retains blocks and Mermaid while detached controls and instances remain independent', () => {
  const container = host(), toolbar = host(), footer = host();
  const sentinel = document.createElement('button'); sentinel.textContent = 'Host-owned'; toolbar.append(sentinel);
  let changes = 0, states = 0;
  const editor = ui.createBlockEditor(container, { markdown: '# Original\n\nTexto', toolbar, footer, onChange() { changes++; } });
  const other = ui.createBlockEditor(container, { markdown: 'Otro editor', toolbar: false });
  const unsubscribe = editor.subscribe(() => states++);
  editor.insertBlock('h2');
  assert.match(editor.getMarkdown(), /^## Original/);
  assert.equal(changes, 1);
  assert.equal(editor.can('undo'), true);
  assert.equal(editor.execute('undo'), true);
  assert.match(editor.getMarkdown(), /^# Original/);
  assert.equal(other.getMarkdown().trim(), 'Otro editor');
  assert.equal(toolbar.querySelectorAll('.block-toolbar').length, 1);
  editor.setMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n\n```mermaid\nflowchart LR\n A --> B\n```');
  assert.match(editor.getMarkdown(), /```mermaid\nflowchart LR/);
  assert.equal(editor.getJSON().content![0].type, 'table');
  assert.equal(editor.can('undo'), false, 'external replacement resets undo history');
  assert.equal(changes, 2, 'external replacement does not echo a save');
  const current = editor.getJSON();
  assert.throws(() => editor.setContent({ type: 'unknown' }));
  assert.deepEqual(editor.getJSON(), current);
  assert.ok(states > 1);
  unsubscribe(); editor.destroy(); editor.destroy();
  assert.equal(toolbar.children.length, 1); assert.equal(toolbar.firstChild, sentinel);
  assert.equal(footer.children.length, 0);
  assert.equal(other.getMarkdown().trim(), 'Otro editor');
  assert.equal(container.querySelectorAll('.ProseMirror').length, 1);
  other.destroy(); container.remove(); toolbar.remove(); footer.remove();
});

test('host commands respect read-only and full document replacements are explicit', () => {
  const container = host(); let changes = 0;
  const editor = ui.createBlockEditor(container, { markdown: 'Seguro', readOnly: true, onChange() { changes++; } });
  assert.equal(editor.execute('bold'), false);
  assert.equal(editor.insertBlock('table'), false);
  assert.equal(editor.view.editable, false);
  editor.setMarkdown('Nueva revisión', { emit: true });
  assert.equal(changes, 1);
  assert.equal(editor.getMarkdown().trim(), 'Nueva revisión');
  assert.throws(() => ui.createBlockEditor(container, { content: editor.getJSON(), markdown: 'ambiguo' }));
  editor.destroy(); container.remove();
});

test('application pieces mount on their own, emit intents and never mutate host data', () => {
  const result = applyOperations(emptyWorkspace(), { expectedRevision: 0, operations: [
    { op: 'create', ref: 'epic', kind: 'epic', title: 'Épica' },
    { op: 'create', ref: 'story', kind: 'story', parentId: '@epic', title: '<script>Texto seguro</script>', criteria: [{ text: 'Cumplido', checked: false }] },
    { op: 'create', ref: 'doc', kind: 'knowledge', title: 'Ficha' },
    { op: 'link', source: '@story', target: '@doc', type: 'modifies' },
  ] });
  const workspace = result.workspace, item = workspace.items.find(i => i.id === result.refs.story)!, before = JSON.stringify(workspace);
  const container = host();
  const seen: string[] = [];
  const board = components.mountBoard(container, { workspace, onOpen: id => seen.push(`open:${id}`) });
  assert.equal(container.querySelector('script'), null);
  assert.equal(board.element.className, 'codaru-planning planning-components');
  assert.ok(board.element.querySelector('.board-filter'));
  board.element.querySelector<HTMLButtonElement>('.card-main')!.click();
  assert.deepEqual(seen, [`open:${item.id}`]);
  // No onCreate: the "add card" controls are hidden instead of doing nothing.
  assert.ok([...board.element.querySelectorAll<HTMLElement>('[data-new-status]')].every(button => button.hidden));
  board.update({ items: [item] });
  assert.equal(board.element.querySelector('.board-filter'), null);

  const properties = components.mountProperties(container, { workspace, item, onStatus: status => seen.push(`status:${status}`), onUnlink: id => seen.push(`unlink:${id}`) });
  const select = properties.element.querySelector<HTMLSelectElement>('#item-status')!;
  select.value = 'done'; select.dispatchEvent(new dom.window.Event('change'));
  assert.equal(seen.at(-1), 'status:done'); assert.equal(select.value, 'todo');
  assert.equal(properties.element.querySelector<HTMLSelectElement>('#item-priority')!.disabled, true);
  assert.equal(properties.element.querySelector<HTMLElement>('[data-action="link"]')!.hidden, true);
  properties.element.querySelector<HTMLButtonElement>('[data-remove-link]')!.click();
  assert.equal(seen.at(-1), `unlink:${workspace.relations[0].id}`);
  properties.update({ relations: false });
  assert.equal(properties.element.querySelector('.relation-row'), null);

  let checked: boolean | undefined;
  const criteria = components.mountCriteria(container, { item, onToggle(_id, value) { checked = value; } });
  const checkbox = criteria.element.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  checkbox.click(); assert.equal(checked, true); assert.equal(checkbox.checked, false);
  assert.equal(criteria.element.querySelector<HTMLInputElement>('[data-criterion-text]')!.readOnly, true);

  const sidebar = components.mountSidebar(container, { workspace, view: 'board', onView: view => seen.push(`view:${view}`), className: 'mi-barra' });
  assert.ok(sidebar.element.classList.contains('mi-barra'));
  sidebar.element.querySelector<HTMLButtonElement>('[data-view="knowledge"]')!.click();
  assert.equal(seen.at(-1), 'view:knowledge');
  sidebar.update({ view: 'knowledge', icon: name => `<i data-icon="${name}"></i>` });
  assert.ok(sidebar.element.querySelector('[data-view="knowledge"].selected [data-icon="knowledge"]'));

  const tabs = components.mountDetailTabs(container, { workspace, item, tab: 'content', onTab: tab => seen.push(`tab:${tab}`) });
  tabs.element.querySelector<HTMLButtonElement>('[data-detail-tab="context"]')!.click();
  assert.equal(seen.at(-1), 'tab:context');

  assert.equal(JSON.stringify(workspace), before);
  for (const piece of [board, properties, criteria, sidebar, tabs]) piece.destroy();
  assert.equal(container.children.length, 0);
  container.remove();
});

test('sidebar sections can be reordered, hidden, collapsed, searched and extended with host content', () => {
  const workspace = applyOperations(emptyWorkspace(), { expectedRevision: 0, operations: [{ op: 'create', kind: 'epic', title: 'Épica' }] }).workspace;
  const container = host();
  const plain = components.sidebarMarkup(workspace);
  assert.equal(plain, components.sidebarMarkup(workspace, { sections: ['views', 'epics', 'status'] }));
  assert.equal(plain.includes('<details'), false);
  const tree = document.createElement('ul'); tree.className = 'host-tree'; tree.textContent = 'Documentos';
  const seen: string[] = [];
  const sidebar = components.mountSidebar(container, { workspace, sections: ['search', 'views', 'epics'], views: ['knowledge', 'board'], collapsed: ['epics'], collapsible: ['views'], slots: { views: tree },
    onSearch: value => seen.push(`search:${value}`), onNewEpic: () => seen.push('new-epic') });
  const root = sidebar.element;
  assert.deepEqual([...root.querySelectorAll<HTMLElement>('.sidebar > *')].map(e => e.tagName + (e.dataset.section ? `:${e.dataset.section}` : '')), ['LABEL', 'DETAILS:views', 'DETAILS:epics']);
  assert.deepEqual([...root.querySelectorAll<HTMLElement>('[data-view]')].map(e => e.dataset.view), ['knowledge', 'board']);
  assert.equal(root.querySelector('.local-status'), null);
  assert.equal(root.querySelector<HTMLDetailsElement>('[data-section="views"]')!.open, true);
  assert.equal(root.querySelector<HTMLDetailsElement>('[data-section="epics"]')!.open, false);
  assert.equal(tree.parentElement!.dataset.slot, 'views');
  assert.equal(tree.closest('[data-section="views"]') !== null, true);
  const search = root.querySelector<HTMLInputElement>('[data-search]')!;
  search.value = 'auth'; search.dispatchEvent(new dom.window.Event('input'));
  assert.deepEqual(seen, ['search:auth']);
  // The new-epic button lives in the summary; it must act without toggling the section.
  root.querySelector<HTMLButtonElement>('summary [data-new-kind]')!.click();
  assert.equal(seen.at(-1), 'new-epic');
  assert.equal(root.querySelector<HTMLDetailsElement>('[data-section="epics"]')!.open, false);
  // What the person opened survives later updates, and the host element is the same node.
  const epics = root.querySelector<HTMLDetailsElement>('[data-section="epics"]')!;
  epics.open = true; epics.dispatchEvent(new dom.window.Event('toggle'));
  sidebar.update({ view: 'knowledge', query: 'auth' });
  assert.equal(root.querySelector<HTMLDetailsElement>('[data-section="epics"]')!.open, true);
  assert.equal(root.querySelector('.host-tree'), tree);
  assert.equal(root.querySelector<HTMLInputElement>('[data-search]')!.value, 'auth');
  sidebar.destroy(); container.remove();
});
