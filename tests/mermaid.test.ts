import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { history, undo, redo } from "prosemirror-history";
import { schema, validContent } from "../src/schema.ts";
import { changeBlock, slashMatch, duplicateBlock, moveBlockTo } from "../src/editor/blocks.ts";
import { defaultMermaid, extractMermaidFence } from "../src/editor/mermaid-source.ts";
import { parseMermaidPreview } from "../src/editor/mermaid-parser.ts";
import { markdown } from "../packages/planning-core/src/index.ts";
import { visualMermaidEdit, applyMermaidEdit } from "../src/editor/mermaid-editing.ts";

test("inserting a diagram consumes slash, leaves an editable paragraph and undoes atomically", () => {
  let state = EditorState.create({ schema, plugins: [history()], doc: schema.nodes.doc.create(null,
    schema.nodes.paragraph.create(null, schema.text("/diagrama"))) });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 10)));
  const before = state.doc.toJSON();
  const dispatch = (tr: any) => { state = state.apply(tr); state.doc.check(); };
  assert.ok(changeBlock("mermaid", slashMatch(state))(state, dispatch));
  assert.equal(state.doc.firstChild!.attrs.language, "mermaid");
  assert.equal(state.doc.firstChild!.textContent, defaultMermaid);
  assert.equal(state.selection.$from.parent.type.name, "paragraph");
  assert.ok(undo(state, dispatch));
  assert.deepEqual(state.doc.toJSON(), before);
});

test("Kairo preview retains graph labels and connections without rewriting Mermaid", () => {
  const source = '%% comentario\nflowchart LR\n  A[Idea] -->|entrega| B[Documento]\n  style A fill:#fff';
  const parsed = parseMermaidPreview(source);
  assert.deepEqual(parsed.document.graph.nodes.map(n => n.title), ["Idea", "Documento"]);
  assert.equal(parsed.document.graph.edges[0].label, "entrega");
  assert.match(parsed.notice, /estilos/);
  let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text("Documento")),
    schema.nodes.code_block.create({ language: "mermaid" }, schema.text(source)),
  ]) });
  const dispatch = (tr: any) => { state = state.apply(tr); state.doc.check(); };
  duplicateBlock(1)(state, dispatch);
  moveBlockTo(2, 0)(state, dispatch);
  assert.equal(state.doc.firstChild!.textContent, source);
  assert.deepEqual(validContent(state.doc.toJSON()).toJSON(), state.doc.toJSON());
  assert.equal(markdown(state.doc.firstChild!.toJSON()), '```mermaid\n' + source + '\n```\n\n');
});

test("unsupported Mermaid and malformed flow do not become misleading fallback graphs", () => {
  assert.throws(() => parseMermaidPreview('pie\n  "A" : 10'), /aún no tiene vista previa/);
  assert.throws(() => parseMermaidPreview("flowchart LR\n ??? invalid"));
  assert.throws(() => parseMermaidPreview("flowchart LR\n A -->"));
  assert.throws(() => parseMermaidPreview(""), /Escribe/);
  assert.throws(() => parseMermaidPreview("x".repeat(50001)), /50 000/);
  const sequence = parseMermaidPreview('sequenceDiagram\n Alice->>Bob: Hola');
  assert.equal(sequence.document.graph.edges.length, 1);
  assert.match(sequence.notice, /no representa la línea temporal/);
});

test("pasting consumes only a complete Mermaid fence and preserves its source", () => {
  assert.equal(extractMermaidFence('```mermaid\n' + defaultMermaid + '\n```'), defaultMermaid);
  assert.equal(extractMermaidFence('```mermaid\n' + defaultMermaid + '\n```\n\n'), defaultMermaid);
  assert.equal(extractMermaidFence('~~~~mermaid\r\nflowchart TD\r\n  A --> B\r\n~~~~'), 'flowchart TD\n  A --> B');
  for (const input of [
    'Texto\n```mermaid\nA\n```', '```js\nA\n```', '````mermaid\nA\n```',
    '```mermaid\nA\n~~~', '```mermaid\nA\n```\nTexto\n```mermaid\nB\n```',
  ]) assert.equal(extractMermaidFence(input), undefined);
});

test("visual edits round-trip titles, shapes, new connections, layout and Markdown without Kairo data", () => {
  const before = parseMermaidPreview(defaultMermaid).document;
  const after = structuredClone(before);
  after.graph.nodes[0].title = 'Idea "[nueva]" #35; <texto>\nsegunda línea';
  after.layout.nodes.idea = { x: -30, y: 420, width: 220, height: 100, shape: "diamond" };
  after.graph.nodes.push({ id: "review", title: "Revisión", type: "process" });
  after.layout.nodes.review = { x: 880, y: 30, width: 200, height: 92 };
  after.graph.edges.push({ id: "visual-edge", source: "docs", target: "review", label: 'Sí | "aceptado"' });
  after.layout.edges["visual-edge"] = { sourcePort: "bottom", targetPort: "top", dashed: true };
  const result = visualMermaidEdit(defaultMermaid, before, after);
  const reopened = parseMermaidPreview(result.source, JSON.parse(JSON.stringify(result.kairoLayout))).document;
  assert.equal(reopened.graph.nodes[0].title, after.graph.nodes[0].title);
  assert.equal(reopened.graph.edges.at(-1)!.label, 'Sí | "aceptado"');
  assert.equal(reopened.layout.edges["e-2"].sourcePort, "bottom");
  assert.equal(reopened.layout.edges["e-2"].dashed, true);
  assert.deepEqual(reopened.layout.nodes.idea, after.layout.nodes.idea);
  assert.equal(result.converts, false);
  assert.match(result.source, /^flowchart LR/);
  const exported = markdown(schema.nodes.code_block.create({ language: "mermaid", kairoLayout: result.kairoLayout }, schema.text(result.source)).toJSON());
  assert.ok(exported.includes('```mermaid\n' + result.source));
  assert.ok(!exported.includes('kairoLayout'));
});

test("no-op and position-only edits retain original syntax; semantic conversions are explicit", () => {
  const original = '%% nota\nflowchart RL\n A[Inicio] --> B[Final]\n style A fill:#fff';
  const before = parseMermaidPreview(original).document;
  assert.equal(visualMermaidEdit(original, before, before).source, original);
  const moved = structuredClone(before);
  moved.layout.nodes.A.x = 700;
  const positioning = visualMermaidEdit(original, before, moved);
  assert.equal(positioning.source, original);
  assert.equal(positioning.converts, false);
  moved.graph.nodes[0].title = "Actualizado";
  const rewritten = visualMermaidEdit(original, before, moved);
  assert.equal(rewritten.converts, true);
  assert.match(rewritten.source, /^%% nota\nflowchart RL/);
  const sequence = 'sequenceDiagram\n Alice->>Bob: Hola';
  const sequenceDoc = parseMermaidPreview(sequence).document;
  const changed = structuredClone(sequenceDoc);
  changed.graph.nodes[0].title = "Ana";
  assert.equal(visualMermaidEdit(sequence, sequenceDoc, changed).converts, true);
});

test("source edits invalidate old positions and malformed cached layouts are ignored", () => {
  const before = parseMermaidPreview(defaultMermaid).document;
  const moved = structuredClone(before);
  moved.layout.nodes.idea.x = 9999;
  const edit = visualMermaidEdit(defaultMermaid, before, moved);
  const newSource = defaultMermaid.replace('Idea]', 'Otra idea]');
  assert.notEqual(parseMermaidPreview(newSource, edit.kairoLayout).document.layout.nodes.idea.x, 9999);
  const corrupt = { source: defaultMermaid, layout: { nodes: { idea: { x: Infinity, y: 1, width: -5, height: 10 } } } };
  assert.deepEqual(parseMermaidPreview(defaultMermaid, corrupt).document.layout, before.layout);
});

test("apply is one undoable transaction, preserves adjacent blocks and rejects stale source", () => {
  const before = parseMermaidPreview(defaultMermaid).document;
  const after = structuredClone(before);
  after.graph.nodes[0].title = "Idea validada";
  const edit = visualMermaidEdit(defaultMermaid, before, after);
  const original = schema.nodes.doc.create(null, [
    schema.nodes.code_block.create({ language: "mermaid" }, schema.text(defaultMermaid)),
    schema.nodes.paragraph.create(null, schema.text("Documento intacto")),
  ]);
  let state = EditorState.create({ schema, doc: original, plugins: [history()] });
  state = state.apply(applyMermaidEdit(state, 0, defaultMermaid, edit));
  const applied = state.doc.toJSON();
  assert.equal(state.doc.lastChild!.textContent, "Documento intacto");
  assert.match(state.doc.firstChild!.textContent, /Idea validada/);
  assert.deepEqual(validContent(applied).toJSON(), applied);
  const dispatch = (tr: any) => { state = state.apply(tr); };
  assert.ok(undo(state, dispatch));
  assert.deepEqual(state.doc.toJSON(), original.toJSON());
  assert.ok(redo(state, dispatch));
  assert.deepEqual(state.doc.toJSON(), applied);
  assert.throws(() => applyMermaidEdit(state, 0, defaultMermaid, edit), /cambió/);
});
