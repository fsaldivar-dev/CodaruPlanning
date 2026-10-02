import hljs from "highlight.js/lib/core";
import swift from "highlight.js/lib/languages/swift";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import { NodeSelection, Plugin } from "prosemirror-state";
import {
  Decoration,
  DecorationSet,
  type EditorView,
  type NodeView,
  type ViewMutationRecord,
} from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { icon } from "../icons";
import { isMermaid } from "./mermaid-source";

for (const [name, language] of Object.entries({
  swift,
  javascript,
  typescript,
  json,
  python,
  bash,
}))
  hljs.registerLanguage(name, language);
export const languages = [
  ["plaintext", "Texto sin formato"],
  ["mermaid", "Mermaid · diagrama"],
  ["swift", "Swift"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["json", "JSON"],
  ["python", "Python"],
  ["bash", "Shell"],
] as const;

export class CodeView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private header: HTMLElement;
  private select: HTMLSelectElement;
  private node: ProseNode;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    node: ProseNode,
    view: EditorView,
    getPos: () => number | undefined,
  ) {
    this.node = node;
    this.dom = document.createElement("div");
    this.dom.className = "code-block";
    this.header = document.createElement("div");
    this.header.className = "code-block-header";
    this.header.contentEditable = "false";
    const label = document.createElement("span");
    label.textContent = "Código";
    label.className = "code-label";
    this.select = document.createElement("select");
    this.select.setAttribute("aria-label", "Lenguaje del código");
    this.select.disabled = !view.editable;
    for (const [value, name] of languages)
      this.select.add(new Option(name, value));
    this.select.onchange = () => {
      const pos = getPos();
      if (pos !== undefined) {
        const tr = view.state.tr.setNodeMarkup(pos, undefined, {
            ...this.node.attrs,
            language: this.select.value,
          });
        if (this.select.value === "mermaid")
          tr.setSelection(NodeSelection.create(tr.doc, pos));
        view.dispatch(tr);
      }
    };
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "icon-button";
    copy.innerHTML = icon("copy");
    copy.setAttribute("aria-label", "Copiar código");
    copy.title = "Copiar código";
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(this.node.textContent);
        copy.innerHTML = icon("check");
        copy.setAttribute("aria-label", "Código copiado");
      } catch {
        copy.setAttribute("aria-label", "Selecciona el código y usa ⌘C");
      }
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        copy.innerHTML = icon("copy");
        copy.setAttribute("aria-label", "Copiar código");
      }, 2500);
    };
    this.header.append(label, this.select, copy);
    const pre = document.createElement("pre");
    this.contentDOM = document.createElement("code");
    this.contentDOM.spellcheck = false;
    pre.append(this.contentDOM);
    this.dom.append(this.header, pre);
    this.sync();
  }
  private sync() {
    this.select.value = languages.some(
      ([id]) => id === this.node.attrs.language,
    )
      ? this.node.attrs.language
      : "plaintext";
    this.dom.dataset.language = this.select.value;
  }
  update(node: ProseNode) {
    if (node.type !== this.node.type || isMermaid(node)) return false;
    this.node = node;
    this.sync();
    return true;
  }
  stopEvent(event: Event) {
    return this.header.contains(event.target as Node);
  }
  ignoreMutation(mutation: ViewMutationRecord) {
    return (
      mutation.type !== "selection" && this.header.contains(mutation.target)
    );
  }
  destroy() {
    clearTimeout(this.timer);
  }
}

export class TaskItemView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private checkbox: HTMLInputElement;
  private label: HTMLLabelElement;
  constructor(
    private node: ProseNode,
    view: EditorView,
    getPos: () => number | undefined,
  ) {
    this.dom = document.createElement("li");
    this.dom.dataset.taskItem = "true";
    this.label = document.createElement("label");
    this.label.contentEditable = "false";
    this.checkbox = document.createElement("input");
    this.checkbox.type = "checkbox";
    this.checkbox.disabled = !view.editable;
    this.checkbox.onchange = () => {
      const pos = getPos();
      if (pos !== undefined)
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, {
            checked: this.checkbox.checked,
          }),
        );
    };
    this.label.append(this.checkbox);
    this.contentDOM = document.createElement("div");
    this.contentDOM.dataset.taskContent = "true";
    this.dom.append(this.label, this.contentDOM);
    this.sync();
  }
  private sync() {
    this.checkbox.checked = this.node.attrs.checked;
    this.checkbox.setAttribute(
      "aria-label",
      `Completar: ${this.node.textContent || "tarea sin título"}`,
    );
    this.dom.dataset.checked = String(this.node.attrs.checked);
  }
  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.sync();
    return true;
  }
  stopEvent(event: Event) {
    return this.label.contains(event.target as Node);
  }
  ignoreMutation(mutation: ViewMutationRecord) {
    return (
      mutation.type !== "selection" &&
      (this.label.contains(mutation.target) ||
        (mutation.target === this.dom && mutation.type === "attributes"))
    );
  }
}

export function codeHighlighting() {
  const cache = new Map<
    string,
    { from: number; to: number; className: string }[]
  >();
  function decorations(doc: ProseNode) {
    const ranges: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (
        node.type.name !== "code_block" ||
        !hljs.getLanguage(node.attrs.language) ||
        node.content.size > 20000
      )
        return;
      const key = `${node.attrs.language}\0${node.textContent}`;
      let tokens = cache.get(key);
      if (!tokens) {
        // highlight() escapes source text; only its generated spans enter this detached fragment.
        const template = document.createElement("template");
        template.innerHTML = hljs.highlight(node.textContent, {
          language: node.attrs.language,
          ignoreIllegals: true,
        }).value;
        tokens = [];
        let offset = 0;
        const walk = (parent: Node) => {
          for (const child of parent.childNodes) {
            const start = offset;
            if (child.nodeType === Node.TEXT_NODE)
              offset += child.textContent!.length;
            else {
              walk(child);
              if (
                child instanceof HTMLElement &&
                child.className &&
                offset > start
              )
                tokens!.push({
                  from: start,
                  to: offset,
                  className: child.className,
                });
            }
          }
        };
        walk(template.content);
        cache.set(key, tokens);
        if (cache.size > 24) cache.delete(cache.keys().next().value!);
      }
      for (const token of tokens)
        ranges.push(
          Decoration.inline(pos + 1 + token.from, pos + 1 + token.to, {
            class: token.className,
          }),
        );
    });
    return DecorationSet.create(doc, ranges);
  }
  return new Plugin<DecorationSet>({
    state: {
      init: (_, state) => decorations(state.doc),
      apply: (tr, old) =>
        tr.docChanged ? decorations(tr.doc) : old.map(tr.mapping, tr.doc),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
