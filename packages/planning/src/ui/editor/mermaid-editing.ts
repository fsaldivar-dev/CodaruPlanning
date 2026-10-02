import { toFlowText } from "@fsaldivar.dev/diagram/io";
import type { DiagramDocument, DiagramLayout, NodeLayout, EdgeLayout } from "@fsaldivar.dev/diagram";
import { closeHistory } from "prosemirror-history";
import { NodeSelection, type EditorState } from "prosemirror-state";
import { isMermaid } from "./mermaid-source.js";

export type MermaidLayout = { source: string; layout: DiagramLayout };
export type MermaidEdit = { source: string; kairoLayout: MermaidLayout; converts: boolean };

// Mermaid decimal entities keep structural characters inside labels, not in the grammar.
const encode = (text: string) => text.replace(/[\x00-\x1f#&"[\]{}()|<>\\`]/g,
  char => `#${char.charCodeAt(0)};`);
export function decodeMermaidLabel(text: string) {
  return text.replace(/#(\d{1,7});/g, (entity, digits) => {
    const value = Number(digits);
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
      ? String.fromCodePoint(value) : entity;
  });
}

function asFlow(doc: DiagramDocument, source: string) {
  const encoded = structuredClone(doc);
  for (const node of encoded.graph.nodes) {
    node.title = encode(node.title);
    if (node.group) node.group = encode(node.group);
  }
  for (const edge of encoded.graph.edges) if (edge.label) edge.label = encode(edge.label);
  const direction = /^\s*(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/m.exec(source)?.[1] || "TD";
  return toFlowText(encoded, { direction: direction as "TD" });
}

/** Layout remains local presentation; Markdown contains portable Mermaid, not serialized Kairo. */
export function visualMermaidEdit(original: string, before: DiagramDocument, after: DiagramDocument): MermaidEdit {
  const flow = asFlow(after, original);
  const changed = flow !== asFlow(before, original);
  const header = original.split(/\r?\n/).find(line => line.trim() && !line.trim().startsWith("%%")) || "";
  const converts = changed && (!/^\s*(flowchart|graph)\b/.test(header) ||
    /^\s*(classDef\b|class\b|style\b|linkStyle\b|click\b|subgraph\b|direction\b|%%\{)/m.test(original));
  const comments = original.split(/\r?\n/).filter(line => /^\s*%%(?!\{)/.test(line));
  const source = changed ? [...comments, flow].join("\n") : original;
  if (!after.graph.nodes.length) throw new Error("Añade al menos un nodo antes de aplicar.");
  if (source.length > 50000 || after.graph.nodes.length > 200)
    throw new Error("El diagrama admite hasta 200 nodos y 50 000 caracteres.");
  const edges: Record<string, EdgeLayout> = Object.create(null);
  // The Mermaid importer regenerates edge IDs in source order.
  after.graph.edges.forEach((edge, index) => { edges[`e-${index}`] = { ...after.layout.edges[edge.id] }; });
  return { source, converts, kairoLayout: {
    source, layout: { nodes: structuredClone(after.layout.nodes), edges: changed ? edges : structuredClone(after.layout.edges) },
  } };
}

export function restoreMermaidLayout(doc: DiagramDocument, source: string, cached: unknown) {
  if (!cached || typeof cached !== "object") return doc;
  const value = cached as Partial<MermaidLayout>;
  if (value.source !== source || !value.layout) return doc;
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1000000;
  const shapes = ["rectangle", "diamond", "ellipse", "pill", "cylinder", "document", "parallelogram", "hexagon", "trapezoid", "triangle", "note", "subprocess"];
  for (const node of doc.graph.nodes) {
    const box = value.layout.nodes?.[node.id] as NodeLayout | undefined;
    if (box && [box.x, box.y, box.width, box.height].every(finite) && box.width > 0 && box.height > 0) {
      doc.layout.nodes[node.id] = { x: box.x, y: box.y, width: box.width, height: box.height,
        ...(box.shape && shapes.includes(box.shape) ? { shape: box.shape } : {}) };
    }
  }
  for (const edge of doc.graph.edges) {
    const box = value.layout.edges?.[edge.id] as EdgeLayout | undefined;
    if (!box || !["top", "right", "bottom", "left"].includes(box.sourcePort) ||
      !["top", "right", "bottom", "left"].includes(box.targetPort)) continue;
    const layout: EdgeLayout = { sourcePort: box.sourcePort, targetPort: box.targetPort };
    if (typeof box.dashed === "boolean") layout.dashed = box.dashed;
    for (const field of ["startMarker", "endMarker"] as const)
      if (box[field] && ["none", "arrow", "dot"].includes(box[field]!)) layout[field] = box[field];
    if (box.labelPosition && ["start", "middle", "end"].includes(box.labelPosition)) layout.labelPosition = box.labelPosition;
    if (finite(box.labelOffset)) layout.labelOffset = box.labelOffset;
    doc.layout.edges[edge.id] = layout;
  }
  return doc;
}

/** Reject stale editors instead of replacing a changed or deleted block. */
export function applyMermaidEdit(state: EditorState, pos: number, expected: string, edit: MermaidEdit) {
  const node = state.doc.nodeAt(pos);
  if (!node || !isMermaid(node) || node.textContent !== expected)
    throw new Error("El bloque cambió mientras editabas. Cierra este editor y vuelve a abrirlo.");
  const tr = closeHistory(state.tr).replaceWith(pos, pos + node.nodeSize,
    node.type.create({ ...node.attrs, kairoLayout: edit.kairoLayout }, state.schema.text(edit.source)));
  return tr.setSelection(NodeSelection.create(tr.doc, pos));
}
