import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import {
  addRowAfter,
  addColumnAfter,
  tableEditing,
  TableMap,
} from "prosemirror-tables";
import { schema, validContent } from "../src/schema.ts";
import {
  changeBlock,
  slashMatch,
  moveBlockTo,
  duplicateBlock,
  deleteBlock,
  createTable,
} from "../src/editor/blocks.ts";
import { markdown, plain } from "../packages/planning-core/src/index.ts";
import { bindNavigation } from "../src/navigation.ts";
const p = (text = "") =>
  schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
function harness(nodes: any[]) {
  let state = EditorState.create({
    schema,
    doc: schema.nodes.doc.create(null, nodes),
    plugins: [history(), tableEditing()],
  });
  return {
    get state() {
      return state;
    },
    select(pos: number) {
      state = state.apply(
        state.tr.setSelection(TextSelection.create(state.doc, pos)),
      );
    },
    run(cmd: Command) {
      assert.equal(
        cmd(state, (tr) => {
          state = state.applyTransaction(tr).state;
        }),
        true,
      );
      state.doc.check();
    },
  };
}
test("slash conversion is a single undoable edit and never triggers in URLs or code", () => {
  const h = harness([p("/titulo")]);
  h.select(8);
  const before = h.state.doc.toJSON();
  h.run(changeBlock("h1", slashMatch(h.state)));
  assert.equal(h.state.doc.firstChild!.type.name, "heading");
  assert.equal(h.state.doc.textContent, "");
  h.run(undo);
  assert.deepEqual(h.state.doc.toJSON(), before);
  for (const node of [
    p("https://example.com/"),
    schema.nodes.code_block.create(null, schema.text("/code")),
  ]) {
    const x = harness([node]);
    x.select(node.nodeSize - 1);
    assert.equal(slashMatch(x.state), undefined);
  }
});
test("tables insert, grow with table commands and survive undo", () => {
  const h = harness([p("/tabla")]);
  h.select(7);
  h.run(changeBlock("table", slashMatch(h.state)));
  assert.equal(TableMap.get(h.state.doc.firstChild!).width, 3);
  h.run(addRowAfter);
  h.run(addColumnAfter);
  assert.equal(TableMap.get(h.state.doc.firstChild!).height, 4);
  assert.equal(TableMap.get(h.state.doc.firstChild!).width, 4);
  assert.equal(h.state.doc.lastChild!.type.name, "paragraph");
});
test("moving and duplicating complex blocks preserves table cells, language and checked tasks", () => {
  const table = createTable(),
    code = schema.nodes.code_block.create(
      { language: "swift" },
      schema.text("func demo() {}"),
    );
  const tasks = schema.nodes.task_list.create(null, [
    schema.nodes.task_item.create({ checked: true }, p("Listo")),
  ]);
  const h = harness([p("Inicio"), table, code, tasks]);
  h.run(moveBlockTo(2, 0));
  assert.deepEqual(h.state.doc.firstChild!.toJSON(), code.toJSON());
  h.run(duplicateBlock(3));
  assert.deepEqual(h.state.doc.child(4).toJSON(), tasks.toJSON());
  h.run(deleteBlock(2));
  assert.equal(h.state.doc.childCount, 4);
  h.run(undo);
  assert.deepEqual(h.state.doc.child(2).toJSON(), table.toJSON());
  const one = harness([code]);
  one.run(deleteBlock());
  assert.equal(one.state.doc.firstChild!.type.name, "paragraph");
});
test("Markdown and context retain code fences, checked lists and table boundaries", () => {
  const table = schema.nodes.table.create(null, [
    schema.nodes.table_row.create(null, [
      schema.nodes.table_header.create(null, p("Nombre")),
      schema.nodes.table_header.create(null, p("Estado")),
    ]),
    schema.nodes.table_row.create(null, [
      schema.nodes.table_cell.create(null, p("A | B")),
      schema.nodes.table_cell.create(null, p("Vigente")),
    ]),
  ]);
  const code = schema.nodes.code_block.create(
    { language: "swift" },
    schema.text("func demo() { /* ``` */ }"),
  );
  const tasks = schema.nodes.task_list.create(null, [
    schema.nodes.task_item.create({ checked: true }, p("Listo")),
  ]);
  const doc = schema.nodes.doc.create(null, [table, code, tasks]).toJSON();
  const result = markdown(doc);
  assert.match(result, /\| Nombre \| Estado \|\n\| --- \| --- \|/);
  assert.ok(result.includes("A \\| B"));
  assert.match(result, /````swift\nfunc demo/);
  assert.match(result, /- \[x\] Listo/);
  assert.match(plain(doc), /Nombre \| Estado\nA \| B \| Vigente/);
  assert.deepEqual(validContent(doc).toJSON(), doc);
  assert.equal(
    validContent({
      type: "doc",
      content: [
        { type: "code_block", content: [{ type: "text", text: "legacy" }] },
      ],
    }).firstChild!.attrs.language,
    "plaintext",
  );
});
test("ordinary scroll is untouched in documents and pans diagrams; only commands/pinch zoom", () => {
  class Host extends EventTarget {
    clientHeight = 600;
  }
  const host = new Host();
  let zoom = 1,
    pans: number[][] = [];
  const wheel = (fields: Record<string, unknown>) => {
    const event = new Event("wheel", { cancelable: true });
    Object.assign(event, {
      deltaX: 0,
      deltaY: 80,
      deltaMode: 0,
      clientX: 30,
      clientY: 40,
      ...fields,
    });
    host.dispatchEvent(event);
    return event;
  };
  let cleanup = bindNavigation(host as any, {
    getZoom: () => zoom,
    setZoom: (v) => {
      zoom = v;
    },
  });
  assert.equal(wheel({}).defaultPrevented, false);
  assert.equal(zoom, 1);
  assert.equal(wheel({ metaKey: true, deltaY: -40 }).defaultPrevented, true);
  assert.ok(zoom > 1);
  const pinch = (type: string, scale = 1) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { scale, clientX: 0, clientY: 0 });
    host.dispatchEvent(e);
  };
  zoom = 1;
  pinch("gesturestart");
  pinch("gesturechange", 1.5);
  assert.equal(zoom, 1.5);
  pinch("gestureend");
  cleanup();
  zoom = 1;
  cleanup = bindNavigation(host as any, {
    getZoom: () => zoom,
    setZoom: (v) => {
      zoom = v;
    },
    pan: (x, y) => pans.push([x, y]),
  });
  assert.equal(wheel({ deltaX: 12 }).defaultPrevented, true);
  assert.deepEqual(pans, [[12, 80]]);
  assert.equal(zoom, 1);
  cleanup();
  assert.equal(wheel({ metaKey: true }).defaultPrevented, false);
});
