import { parseMermaid } from "@fsaldivar.dev/diagram/io";
import { decodeMermaidLabel, restoreMermaidLayout } from "./mermaid-editing.js";

/** Kairo is a structural preview. The parsed document must never replace the source. */
export function parseMermaidPreview(source: string, layout?: unknown) {
  if (!source.trim()) throw new Error("Escribe un diagrama Mermaid para verlo aquí.");
  if (source.length > 50000)
    throw new Error("La vista previa admite hasta 50 000 caracteres. La fuente se conserva completa.");
  const header = source.split(/\r?\n/).map(line => line.trim())
    .find(line => line && !line.startsWith("%%")) || "";
  if (!/^(?:(?:flowchart|graph)\s+(?:TB|TD|BT|LR|RL)\b|stateDiagram(?:-v2)?\b|classDiagram\b|erDiagram\b|mindmap\b|sequenceDiagram\b)/.test(header))
    throw new Error("Este tipo de Mermaid aún no tiene vista previa en Kairo. Usa flujo, estados, clases, entidades, mapa mental o secuencia. La fuente se conserva.");
  const document = parseMermaid(source);
  for (const node of document.graph.nodes) {
    node.title = decodeMermaidLabel(node.title);
    if (node.group) node.group = decodeMermaidLabel(node.group);
  }
  for (const edge of document.graph.edges) if (edge.label) edge.label = decodeMermaidLabel(edge.label);
  restoreMermaidLayout(document, source, layout);
  if (!document.graph.nodes.length) throw new Error("Kairo no encontró nodos para mostrar.");
  if (document.graph.nodes.length > 200)
    throw new Error("La vista previa admite hasta 200 nodos. La fuente se conserva completa.");
  let notice = "";
  if (header.startsWith("sequenceDiagram"))
    notice = "Kairo muestra participantes y mensajes como un grafo; no representa la línea temporal ni los bloques de control de Mermaid.";
  else if (/^(classDiagram|erDiagram)/.test(header))
    notice = "Vista estructural de Kairo: entidades y relaciones. Algunos detalles de la notación Mermaid no se representan.";
  if (/^\s*(?:classDef\b|class\s+\S+\s+\S+|style\b|linkStyle\b|click\b|%%\{)/m.test(source))
    notice += `${notice ? " " : ""}Los estilos e interacciones Mermaid se conservan en la fuente; la vista usa el estilo de Kairo.`;
  return { document, notice };
}
