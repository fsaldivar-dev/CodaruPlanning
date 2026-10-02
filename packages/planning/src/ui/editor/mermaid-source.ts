export const defaultMermaid = `flowchart LR
  idea[Idea] --> entrega[Entrega]
  entrega --> docs[Documentación viva]`;

export const isMermaid = (node: { type: { name: string }; attrs: Record<string, unknown> }) =>
  node.type.name === "code_block" &&
  String(node.attrs.language).trim().toLowerCase() === "mermaid";

/** Only consume a complete fenced block, never a document containing other text. */
export function extractMermaidFence(text: string): string | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})mermaid[^\S\r\n]*\r?\n([\s\S]*?)\r?\n {0,3}(`{3,}|~{3,})[^\S\r\n]*(?:\r?\n[^\S\r\n]*)*$/i.exec(text);
  if (!match || match[1][0] !== match[3][0] || match[3].length < match[1].length)
    return;
  // An earlier closing fence means this is more than one Markdown block.
  if (match[2].split(/\r?\n/).some(line =>
    new RegExp(`^ {0,3}${match[1][0]}{${match[1].length},}\\s*$`).test(line))) return;
  return match[2].replace(/\r\n/g, "\n");
}
