import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { applyOperations, emptyWorkspace, fromMarkdown, validateWorkspace, agentSnapshot, workspaceDiff, itemsByDesign, exportItem, contextRecords, type Workspace } from "@fsaldivar.dev/planning";
let dom: JSDOM;
let components: typeof import("@fsaldivar.dev/planning/components");
before(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  for (const key of ["window", "document", "Node", "Element", "HTMLElement"]) Object.defineProperty(globalThis, key, { configurable: true, value: (dom.window as any)[key] });
  components = await import("@fsaldivar.dev/planning/components");
});
after(() => dom.window.close());
const design = [{ file: ".codaru/Mockups.codarumockup", screen: "s-login", name: "Inicio de sesión", image: "mockups/login.png" }];
const seed = () => applyOperations(emptyWorkspace("Codaru"), { expectedRevision: 0, actor: "FranPlanner", operations: [
  { op: "create", ref: "story", kind: "story", title: "Pantalla de acceso", design, labels: ["Propuesta", "iPad ", "propuesta"], criteria: [{ text: "Contraste AA", checked: false }] },
  { op: "create", ref: "doc", kind: "knowledge", title: "ADR 0001", file: "docs/adr/0001-auth.md", markdown: "Ver [datos](../datos.md#campos) y [ADR](adr/0001-x.md)." },
  { op: "link", source: "@story", target: "@doc", type: "references" },
] });

test("design refs, labels and files are validated and normalized; 0.3.0 documents still validate", () => {
  const { workspace, refs } = seed();
  const story = workspace.items.find(i => i.id === refs.story)!;
  assert.deepEqual(story.labels, ["propuesta", "ipad"]);
  assert.deepEqual(story.design, design);
  assert.equal(workspace.items.find(i => i.id === refs.doc)!.file, "docs/adr/0001-auth.md");
  assert.deepEqual(itemsByDesign(workspace, design[0].file, "s-login").map(i => i.id), [story.id]);
  const bad = (patch: object, pattern: RegExp) => assert.throws(() => applyOperations(workspace, { expectedRevision: 0, operations: [{ op: "update", id: story.id, patch }] }), pattern);
  bad({ labels: ["a b c d e f g h i j k l m n o p q r s t u v w x y"] }, /Etiqueta inválida/);
  bad({ labels: ["1", "2", "3", "4", "5", "6", "7", "8", "9"] }, /Hasta 8/);
  bad({ design: [design[0], { ...design[0], name: "otra" }] }, /repetida/);
  bad({ design: [{ file: "http://x/y", screen: "s" }] }, /rutas relativas/);
  bad({ design: [{ file: "m.codarumockup", screen: "s", image: "data:image/png;base64,AAAA" }] }, /rutas relativas/);
  bad({ design: Array.from({ length: 21 }, (_, i) => ({ file: "m", screen: `s${i}` })) }, /Hasta 20/);
  bad({ file: "notas.md" }, /conocimiento/);
  const cleared = applyOperations(workspace, { expectedRevision: 0, operations: [{ op: "update", id: story.id, patch: { labels: null, design: null } }] }).workspace;
  assert.equal(cleared.items[0].labels, undefined); assert.equal(cleared.items[0].design, undefined);
  const legacy = JSON.parse(JSON.stringify(workspace)) as Workspace;
  for (const item of legacy.items) { delete item.design; delete item.labels; delete item.activity; delete item.file; }
  validateWorkspace(legacy);
  (legacy.items[0] as any).labels = ["dup", "dup"];
  assert.throws(() => validateWorkspace(legacy), /etiquetas/);
  assert.match(exportItem(workspace, story), /Etiquetas: propuesta, ipad[\s\S]*Diseño: \.codaru\/Mockups\.codarumockup#s-login \(Inicio de sesión\)/);
  assert.equal(contextRecords(workspace).find(r => r.id === refs.doc)!.file, "docs/adr/0001-auth.md");
});

test("activity records who moved what and why, bounded to 200 entries", () => {
  const { workspace, refs } = seed();
  const next = applyOperations(workspace, { expectedRevision: 0, actor: "runner de pruebas", operations: [
    { op: "status", id: refs.story, status: "doing", note: "construida según Contraste" },
    { op: "update", id: refs.story, patch: { labels: ["ya-construida"], criteria: [{ text: "Contraste AA", checked: true }] } },
    { op: "archive", id: refs.story }, { op: "restore", id: refs.story },
  ] }).workspace;
  const story = next.items.find(i => i.id === refs.story)!;
  assert.deepEqual(story.activity!.map(a => [a.op, a.actor, a.note, a.from, a.to, a.fields]), [
    ["link", "FranPlanner", "references", undefined, refs.doc, undefined],
    ["status", "runner de pruebas", "construida según Contraste", "todo", "doing", undefined],
    ["update", "runner de pruebas", undefined, undefined, undefined, ["labels", "criteria"]],
    ["archive", "runner de pruebas", undefined, undefined, undefined, undefined],
    ["restore", "runner de pruebas", undefined, undefined, undefined, undefined],
  ]);
  // A create does not log an "update"; a status without change logs nothing.
  assert.equal(story.activity!.filter(a => a.op === "status").length, 1);
  let ws = next;
  for (let i = 0; i < 110; i++) ws = applyOperations(ws, { expectedRevision: ws.revision, operations: [{ op: "status", id: refs.story, status: i % 2 ? "doing" : "review" }] }).workspace;
  assert.equal(ws.items.find(i => i.id === refs.story)!.activity!.length, 115);
  for (let i = 0; i < 100; i++) ws = applyOperations(ws, { expectedRevision: ws.revision, operations: [{ op: "status", id: refs.story, status: i % 2 ? "doing" : "review" }] }).workspace;
  const log = ws.items.find(i => i.id === refs.story)!.activity!;
  assert.equal(log.length, 200); assert.equal(log[0].op, "status");
  assert.throws(() => applyOperations(ws, { expectedRevision: ws.revision, actor: "", operations: [{ op: "rename", name: "x" }] }), /actor/);
});

test("agentSnapshot is a fraction of the board and workspaceDiff lists what changed", () => {
  let ws = emptyWorkspace("Grande");
  const create = Array.from({ length: 70 }, (_, i) => ({ op: "create" as const, ref: `c${i}`, kind: i % 7 === 0 ? "epic" as const : "story" as const, title: `Tarjeta ${i}`, summary: "Una tarjeta de ejemplo con resumen.", labels: [i % 2 ? "propuesta" : "ya-construida"], criteria: [{ text: "a", checked: true }, { text: "b", checked: false }], markdown: "## Qué queremos lograr\n\n" + "Texto de la ficha. ".repeat(20) + "\n\n## Cómo lo vamos a resolver\n\n- paso uno\n- paso dos\n" }));
  const first = applyOperations(ws, { expectedRevision: 0, operations: create });
  ws = first.workspace;
  const snapshot = agentSnapshot(ws);
  assert.equal(snapshot.items.length, 70); assert.equal(snapshot.counts.todo, 70);
  assert.deepEqual(snapshot.items[1], { id: first.refs.c1, kind: "story", status: "todo", title: "Tarjeta 1", labels: ["propuesta"], criteria: "1/2" });
  assert.ok(JSON.stringify(snapshot).length < JSON.stringify(ws).length / 3, `${JSON.stringify(snapshot).length} vs ${JSON.stringify(ws).length}`);
  const focused = agentSnapshot(ws, { focus: first.refs.c1, include: ["labels"] });
  assert.equal(focused.items[1].criteria, undefined);
  assert.match(focused.focus!.markdown, /^## Qué queremos lograr/);
  const next = applyOperations(ws, { expectedRevision: 0, operations: [
    { op: "create", kind: "idea", title: "Nueva" }, { op: "archive", id: first.refs.c3 },
    { op: "status", id: first.refs.c1, status: "doing" }, { op: "update", id: first.refs.c2, patch: { title: "Otra", labels: ["ipad"] } },
  ] }).workspace;
  const diff = workspaceDiff(ws, next);
  assert.equal(diff.created.length, 1); assert.deepEqual(diff.archived, [first.refs.c3]);
  assert.deepEqual(diff.status, [{ id: first.refs.c1, from: "todo", to: "doing" }]);
  assert.deepEqual(diff.updated.find(u => u.id === first.refs.c2), { id: first.refs.c2, fields: ["title", "labels"] });
});

test("Markdown accepts relative links and keeps rejecting script-like schemes", () => {
  const doc = fromMarkdown("[0001](adr/0001-x.md) y [datos](../datos.md#campos) y [web](https://codaru.app)");
  const hrefs = JSON.stringify(doc).match(/"href":"([^"]+)"/g)!.map(m => m.slice(8, -1));
  assert.deepEqual(hrefs, ["adr/0001-x.md", "../datos.md#campos", "https://codaru.app"]);
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "//evil.example/x", "file:///etc/passwd"]) assert.throws(() => fromMarkdown(`[x](${bad})`), /Enlace Markdown no compatible/, bad);
});

test("pieces render labels, design badges, the file path and activity, and filter by label", () => {
  const { workspace, refs } = seed();
  const ws = applyOperations(workspace, { expectedRevision: 0, actor: "FranPlanner", operations: [{ op: "status", id: refs.story, status: "doing", note: "construida según Contraste" }] }).workspace;
  const story = ws.items.find(i => i.id === refs.story)!, doc = ws.items.find(i => i.id === refs.doc)!;
  const host = document.createElement("div"); document.body.append(host);
  const seen: string[] = [];
  const board = components.mountBoard(host, { workspace: ws, onOpen: id => seen.push(`open:${id}`), onOpenDesign: (ref, id) => seen.push(`design:${ref.screen}:${id}`) });
  assert.deepEqual([...board.element.querySelectorAll(".label-chip")].map(e => e.textContent), ["propuesta", "ipad"]);
  assert.equal(board.element.querySelector(".design-badge")!.textContent!.trim(), "Inicio de sesión");
  board.element.querySelector<HTMLElement>(".design-badge")!.click();
  assert.deepEqual(seen, [`design:s-login:${story.id}`]);
  board.update({ labels: ["ipad"] }); assert.equal(board.element.querySelectorAll(".work-card").length, 1);
  board.update({ labels: [], query: "#otra" }); assert.equal(board.element.querySelectorAll(".work-card").length, 0);
  board.update({ query: "#ipad acceso" }); assert.equal(board.element.querySelectorAll(".work-card").length, 1);
  const properties = components.mountProperties(host, { workspace: ws, item: story, resolveAsset: path => `asset://${path}`, onOpenDesign: (ref, id) => seen.push(`props:${ref.name}:${id}`) });
  assert.equal(properties.element.querySelector<HTMLImageElement>(".design-thumb")!.getAttribute("src"), "asset://mockups/login.png");
  properties.element.querySelector<HTMLButtonElement>(".design-link")!.click();
  assert.equal(seen.at(-1), `props:Inicio de sesión:${story.id}`);
  assert.equal(components.propertiesMarkup(ws, story).includes("design-thumb"), false);
  const history = components.mountHistory(host, { item: story });
  assert.match(history.element.textContent!, /Estado: Por hacer → En curso[\s\S]*FranPlanner · construida según Contraste/);
  const knowledge = components.mountKnowledgeList(host, { workspace: ws, onOpenFile: (path, id) => seen.push(`file:${path}:${id}`) });
  knowledge.element.querySelector<HTMLElement>("[data-open-file]")!.click();
  assert.equal(seen.at(-1), `file:docs/adr/0001-auth.md:${doc.id}`);
  const plainCard = components.cardMarkup(applyOperations(emptyWorkspace(), { expectedRevision: 0, operations: [{ op: "create", kind: "idea", title: "Sin extras" }] }).workspace, { ...story, labels: undefined, design: undefined });
  assert.equal(plainCard.includes("label-"), false); assert.equal(plainCard.includes("design-"), false);
  for (const piece of [board, properties, history, knowledge]) piece.destroy();
});
