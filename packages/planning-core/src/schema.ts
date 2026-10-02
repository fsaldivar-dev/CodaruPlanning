import { Schema, Node as ProseNode } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { tableNodes } from "prosemirror-tables";
import type { RichNode } from "./index.js";

const codeBlock = {
  ...basicSchema.spec.nodes.get("code_block")!,
  attrs: {
    language: { default: "plaintext", validate: "string" },
    kairoLayout: { default: null, validate: "null|object" },
  },
  parseDOM: [
    {
      tag: "pre",
      preserveWhitespace: "full" as const,
      getAttrs: (element: HTMLElement) => ({
        language:
          element.dataset.language ||
          element
            .querySelector("code")
            ?.className.match(/language-([\w-]+)/)?.[1] ||
          "plaintext",
      }),
    },
  ],
  toDOM: (node: ProseNode): import("prosemirror-model").DOMOutputSpec => [
    "pre",
    { "data-language": node.attrs.language },
    ["code", { class: `language-${node.attrs.language}` }, 0],
  ],
};
export const schema = new Schema({
  nodes: addListNodes(
    basicSchema.spec.nodes.remove("image").update("code_block", codeBlock),
    "paragraph block*",
    "block",
  )
    .append({
      task_list: {
        group: "block",
        content: "task_item+",
        parseDOM: [{ tag: "ul[data-task-list]", priority: 60 }],
        toDOM: () => ["ul", { "data-task-list": "true" }, 0],
      },
      task_item: {
        content: "paragraph block*",
        defining: true,
        attrs: { checked: { default: false, validate: "boolean" } },
        parseDOM: [
          {
            tag: "li[data-task-item]",
            priority: 60,
            getAttrs: (element: HTMLElement) => ({
              checked: element.dataset.checked === "true",
            }),
            contentElement: (element: HTMLElement) =>
              element.querySelector<HTMLElement>("[data-task-content]") ||
              element,
          },
        ],
        toDOM: (node) => [
          "li",
          {
            "data-task-item": "true",
            "data-checked": String(node.attrs.checked),
          },
          [
            "label",
            { contenteditable: "false" },
            [
              "input",
              {
                type: "checkbox",
                ...(node.attrs.checked ? { checked: "checked" } : {}),
              },
            ],
          ],
          ["div", { "data-task-content": "true" }, 0],
        ],
      },
    })
    .append(
      tableNodes({
        tableGroup: "block",
        cellContent: "block+",
        cellAttributes: {},
      }),
    ),
  marks: basicSchema.spec.marks,
});
export function validContent(content: RichNode) {
  const node = ProseNode.fromJSON(schema, content);
  node.check();
  return node;
}
