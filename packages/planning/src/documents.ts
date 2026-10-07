import { marked, type Token, type Tokens } from "marked";
import { validContent } from "../../planning-core/src/schema.js";
import { paragraph, rich, validateWorkspace, type RichNode, type Workspace } from "../../planning-core/src/index.js";

/** http(s), mailto and relative paths (`adr/0001.md`, `../datos.md#campos`). Never javascript:, data: or any other scheme. */
export const safeHref = (href: unknown) => typeof href === "string" && !!href && !/[\s]/.test(href) && (/^(https?:|mailto:)/i.test(href) || (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("//")));
/** Accept the same document schema as the visual editor, with bounded nesting. */
export function validateDocument(value: RichNode): RichNode {
  const stack: [RichNode, number][] = [[value, 0]];
  let count = 0;
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (!node || typeof node !== "object" || depth > 64 || ++count > 50000)
      throw new Error("Documento demasiado profundo o con demasiados bloques.");
    if (node.content !== undefined && !Array.isArray(node.content)) throw new Error("Contenido de bloque inválido.");
    for (const mark of node.marks || []) {
      if (mark.type === "link" && !safeHref(mark.attrs?.href))
        throw new Error("Los enlaces deben usar http, https, mailto o una ruta relativa.");
    }
    for (const child of node.content || []) stack.push([child, depth + 1]);
  }
  return validContent(value).toJSON() as RichNode;
}

export function validateDocuments(ws: unknown): asserts ws is Workspace {
  validateWorkspace(ws);
  for (const item of ws.items) {
    validateDocument(item.content);
    if (item.pendingChange) validateDocument(item.pendingChange);
    for (const revision of item.history) validateDocument(revision.content);
  }
  if (ws.draft) validateDocument(ws.draft.content);
}

function inline(tokens: Token[], marks: NonNullable<RichNode["marks"]> = []): RichNode[] {
  return tokens.flatMap((token): RichNode[] => {
    if (token.type === "strong" || token.type === "em")
      return inline((token as Tokens.Strong).tokens, [...marks, { type: token.type }]);
    if (token.type === "link") {
      const link = token as Tokens.Link;
      if (!safeHref(link.href)) throw new Error(`Enlace Markdown no compatible: ${link.href.slice(0, 40)}. Usa http, https, mailto o una ruta relativa.`);
      return inline(link.tokens, [...marks, { type: "link", attrs: { href: link.href, title: link.title || null } }]);
    }
    if (token.type === "br") return [{ type: "hard_break" }];
    if (token.type === "html" && /^<br\s*\/?>$/i.test(token.raw.trim())) return [{ type: "hard_break" }];
    if (token.type === "html" || token.type === "image" || token.type === "del")
      throw new Error(`Markdown no compatible con el editor: ${token.type}. Usa texto o bloques admitidos.`);
    if (token.type === "text" && "tokens" in token && token.tokens) return inline(token.tokens as Token[], marks);
    const value = "text" in token ? String(token.text) : token.raw;
    if (!value) return [];
    const finalMarks = token.type === "codespan" ? [...marks, { type: "code" }] : marks;
    return [{ type: "text", text: value, ...(finalMarks.length ? { marks: finalMarks } : {}) }];
  });
}

function blocks(tokens: Token[], depth = 0): RichNode[] {
  if (depth > 48) throw new Error("Markdown demasiado profundo.");
  return tokens.flatMap((token): RichNode[] => {
    switch (token.type) {
      case "space": case "def": case "checkbox": return [];
      case "heading": return [{ type: "heading", attrs: { level: (token as Tokens.Heading).depth }, content: inline((token as Tokens.Heading).tokens) }];
      case "paragraph": case "text": return [{ type: "paragraph", content: inline((token as Tokens.Paragraph).tokens || [{ type: "text", raw: token.raw, text: (token as Tokens.Text).text }]) }];
      case "code": {
        const code = token as Tokens.Code;
        return [{ type: "code_block", attrs: { language: code.lang?.split(/\s/)[0] || "plaintext" }, ...(code.text ? { content: [{ type: "text", text: code.text }] } : {}) }];
      }
      case "hr": return [{ type: "horizontal_rule" }];
      case "blockquote": return [{ type: "blockquote", content: blocks((token as Tokens.Blockquote).tokens, depth + 1) }];
      case "list": {
        const list = token as Tokens.List;
        const task = list.items.some(item => item.task);
        if (task && (list.ordered || list.items.some(item => !item.task))) throw new Error("Separa las listas de tareas de las listas normales.");
        return [{ type: task ? "task_list" : list.ordered ? "ordered_list" : "bullet_list", ...(list.ordered ? { attrs: { order: list.start || 1 } } : {}), content: list.items.map(item => {
          const content = blocks(item.tokens, depth + 1);
          if (content[0]?.type !== "paragraph") content.unshift(paragraph());
          return { type: task ? "task_item" : "list_item", ...(task ? { attrs: { checked: !!item.checked } } : {}), content };
        }) }];
      }
      case "table": {
        const table = token as Tokens.Table;
        const row = (cells: Tokens.TableCell[], header: boolean): RichNode => ({ type: "table_row", content: cells.map(cell => ({ type: header ? "table_header" : "table_cell", content: [{ type: "paragraph", content: inline(cell.tokens) }] })) });
        return [{ type: "table", content: [row(table.header, true), ...table.rows.map(cells => row(cells, false))] }];
      }
      default: throw new Error(`Bloque Markdown no compatible: ${token.type}.`);
    }
  });
}

/** Markdown is input for tools; humans keep using the visual block editor. */
export function fromMarkdown(source: string): RichNode {
  if (typeof source !== "string" || source.length > 1_000_000) throw new Error("Markdown inválido o mayor a un millón de caracteres.");
  return validateDocument(rich(...blocks(marked.lexer(source, { gfm: true }))));
}
