import { Fragment, type Node as ProseNode } from "prosemirror-model";
import {
  Selection,
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import { setBlockType, wrapIn, lift } from "prosemirror-commands";
import { wrapInList, liftListItem } from "prosemirror-schema-list";
import { closeHistory } from "prosemirror-history";
import { schema } from "../schema";
import { defaultMermaid } from "./mermaid-source";

export const blockTypes = [
  {
    id: "paragraph",
    title: "Texto",
    description: "Párrafo simple",
    symbol: "¶",
    group: "Básico",
    keywords: "text paragraph párrafo parrafo",
  },
  {
    id: "h1",
    title: "Título 1",
    description: "Título grande",
    symbol: "H₁",
    group: "Básico",
    keywords: "heading encabezado titulo",
  },
  {
    id: "h2",
    title: "Título 2",
    description: "Título mediano",
    symbol: "H₂",
    group: "Básico",
    keywords: "heading encabezado titulo",
  },
  {
    id: "h3",
    title: "Título 3",
    description: "Título pequeño",
    symbol: "H₃",
    group: "Básico",
    keywords: "heading encabezado titulo",
  },
  {
    id: "blockquote",
    title: "Cita",
    description: "Destaca una idea o referencia",
    symbol: "❝",
    group: "Básico",
    keywords: "quote cita",
  },
  {
    id: "horizontal_rule",
    title: "Divisor",
    description: "Separa secciones del documento",
    symbol: "—",
    group: "Básico",
    keywords: "divider separador linea",
  },
  {
    id: "bullet_list",
    title: "Lista con viñetas",
    description: "Ideas en una lista",
    symbol: "•",
    group: "Listas",
    keywords: "bullet lista",
  },
  {
    id: "ordered_list",
    title: "Lista numerada",
    description: "Pasos en orden",
    symbol: "1.",
    group: "Listas",
    keywords: "ordered numbered lista",
  },
  {
    id: "task_list",
    title: "Lista de tareas",
    description: "Casillas para marcar avances",
    symbol: "☑",
    group: "Listas",
    keywords: "checklist todo tarea checkbox",
  },
  {
    id: "table",
    title: "Tabla",
    description: "Tres columnas con encabezado",
    symbol: "▦",
    group: "Contenido",
    keywords: "table tabla celdas",
  },
  {
    id: "mermaid",
    title: "Diagrama",
    description: "Mermaid con vista previa de Kairo",
    symbol: "◇",
    group: "Contenido",
    keywords: "mermaid kairo diagrama flujo graph",
  },
  {
    id: "code_block",
    title: "Código",
    description: "Código con lenguaje y formato",
    symbol: "‹›",
    group: "Contenido",
    keywords: "code codigo swift javascript",
  },
] as const;
export type BlockKind = (typeof blockTypes)[number]["id"];
export type SlashMatch = { from: number; to: number; query: string };
export function slashMatch(state: EditorState): SlashMatch | undefined {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type !== schema.nodes.paragraph) return;
  const prefix = $from.parent.textBetween(0, $from.parentOffset, "", "\ufffc");
  const match = /^\/([^/\n]{0,40})$/.exec(prefix);
  if (match) return { from: $from.start(), to: $from.pos, query: match[1] };
}
export function blockAt(
  state: EditorState,
  index = state.selection.$from.depth
    ? state.selection.$from.index(0)
    : Math.min(state.selection.$from.index(0), state.doc.childCount - 1),
) {
  let pos = 0;
  for (let n = 0; n < state.doc.childCount; n++) {
    const node = state.doc.child(n);
    if (n === index) return { node, pos, index };
    pos += node.nodeSize;
  }
}
export function createTable(rows = 3, columns = 3): ProseNode {
  return schema.nodes.table.create(
    null,
    Array.from({ length: rows }, (_, row) =>
      schema.nodes.table_row.create(
        null,
        Array.from(
          { length: columns },
          () =>
            (row
              ? schema.nodes.table_cell
              : schema.nodes.table_header
            ).createAndFill()!,
        ),
      ),
    ),
  );
}
const listNames = ["bullet_list", "ordered_list", "task_list"];
function ancestor(state: EditorState, names: string[]) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--)
    if (names.includes($from.node(depth).type.name))
      return { node: $from.node(depth), pos: $from.before(depth) };
}
// Collect transforms into one transaction, so inserting via / is one undo step.
export function changeBlock(kind: BlockKind, slash?: SlashMatch): Command {
  return (state, dispatch, view) => {
    let tr = state.tr;
    if (slash) tr.delete(slash.from, slash.to);
    const working = state.apply(tr);
    const collect = (next: Transaction) => {
      for (const step of next.steps) tr.step(step);
      tr.setSelection(Selection.fromJSON(tr.doc, next.selection.toJSON()));
    };
    let changed = false;
    if (kind === "table" || kind === "horizontal_rule" || kind === "mermaid") {
      const block = blockAt(working)!;
      const replaceEmpty =
        block.node.type === schema.nodes.paragraph &&
        block.node.content.size === 0;
      const pos = block.pos + (replaceEmpty ? 0 : block.node.nodeSize);
      const node =
        kind === "table"
          ? createTable()
          : kind === "mermaid"
            ? schema.nodes.code_block.create({ language: "mermaid" }, schema.text(defaultMermaid))
          : schema.nodes.horizontal_rule.create();
      const next = working.tr.replaceWith(
        pos,
        replaceEmpty ? pos + block.node.nodeSize : pos,
        [node, schema.nodes.paragraph.create()],
      );
      next.setSelection(
        Selection.near(
          next.doc.resolve(
            kind === "table" ? pos + 4 : pos + node.nodeSize + 1,
          ),
        ),
      );
      collect(next);
      changed = true;
    } else if (listNames.includes(kind)) {
      const list = ancestor(working, listNames);
      if (list) {
        if (list.node.type.name === kind)
          changed = liftListItem(list.node.firstChild!.type)(
            working,
            collect,
            view,
          );
        else {
          const itemType =
            schema.nodes[kind === "task_list" ? "task_item" : "list_item"];
          const items: ProseNode[] = [];
          list.node.forEach((node) =>
            items.push(
              itemType.create(
                kind === "task_list" ? { checked: false } : null,
                node.content,
              ),
            ),
          );
          const next = working.tr.replaceWith(
            list.pos,
            list.pos + list.node.nodeSize,
            schema.nodes[kind].create(null, items),
          );
          next.setSelection(Selection.near(next.doc.resolve(list.pos + 2)));
          collect(next);
          changed = true;
        }
      } else changed = wrapInList(schema.nodes[kind])(working, collect, view);
    } else if (kind === "blockquote") {
      changed = (
        ancestor(working, ["blockquote"])
          ? lift
          : wrapIn(schema.nodes.blockquote)
      )(working, collect, view);
    } else {
      const type = kind.startsWith("h")
        ? schema.nodes.heading
        : schema.nodes[kind];
      const attrs = kind.startsWith("h")
        ? { level: Number(kind[1]) }
        : kind === "code_block"
          ? { language: "plaintext" }
          : undefined;
      changed = setBlockType(type, attrs)(working, collect, view);
      // Choosing Text in an existing paragraph still consumes the slash command.
      if (!changed && kind === "paragraph" && slash) changed = true;
    }
    if (!changed) return false;
    if (dispatch) dispatch(closeHistory(tr).scrollIntoView());
    return true;
  };
}
export function insertParagraphAfter(index?: number): Command {
  return (state, dispatch) => {
    const block = blockAt(state, index);
    if (!block) return false;
    const pos = block.pos + block.node.nodeSize;
    const tr = state.tr.insert(pos, schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    dispatch?.(closeHistory(tr).scrollIntoView());
    return true;
  };
}
export function duplicateBlock(index?: number): Command {
  return (state, dispatch) => {
    const block = blockAt(state, index);
    if (!block) return false;
    const pos = block.pos + block.node.nodeSize;
    const tr = state.tr.insert(pos, block.node.copy(block.node.content));
    tr.setSelection(Selection.near(tr.doc.resolve(pos + 1)));
    dispatch?.(closeHistory(tr).scrollIntoView());
    return true;
  };
}
export function deleteBlock(index?: number): Command {
  return (state, dispatch) => {
    const block = blockAt(state, index);
    if (!block) return false;
    const tr = state.tr.replaceWith(
      block.pos,
      block.pos + block.node.nodeSize,
      state.doc.childCount === 1
        ? schema.nodes.paragraph.create()
        : Fragment.empty,
    );
    tr.setSelection(
      Selection.near(tr.doc.resolve(Math.min(block.pos, tr.doc.content.size))),
    );
    dispatch?.(closeHistory(tr).scrollIntoView());
    return true;
  };
}
export function moveBlockTo(index: number, slot: number): Command {
  return (state, dispatch) => {
    const block = blockAt(state, index);
    if (
      !block ||
      slot < 0 ||
      slot > state.doc.childCount ||
      slot === index ||
      slot === index + 1
    )
      return false;
    let destination =
      slot === state.doc.childCount
        ? state.doc.content.size
        : blockAt(state, slot)!.pos;
    if (slot > index) destination -= block.node.nodeSize;
    const relative = Math.min(
      block.node.nodeSize - 1,
      Math.max(1, state.selection.from - block.pos),
    );
    const tr = state.tr
      .delete(block.pos, block.pos + block.node.nodeSize)
      .insert(destination, block.node);
    tr.setSelection(Selection.near(tr.doc.resolve(destination + relative)));
    dispatch?.(closeHistory(tr).scrollIntoView());
    return true;
  };
}
export function moveBlock(direction: -1 | 1, index?: number): Command {
  return (state, dispatch, view) => {
    const block = blockAt(state, index);
    if (!block) return false;
    return moveBlockTo(block.index, block.index + (direction === 1 ? 2 : -1))(
      state,
      dispatch,
      view,
    );
  };
}
