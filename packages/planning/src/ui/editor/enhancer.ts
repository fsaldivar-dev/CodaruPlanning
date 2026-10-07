import type { Node as ProseNode } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";
import type { Decoration, EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";

export type BlockContext = {
  /** Fence language, normalized to lowercase. */
  language: string;
  /** Color scheme of the document when the block renders. Prefer CSS variables for live theme changes. */
  theme: "light" | "dark";
  readOnly: boolean;
  /** Loads a file through the host (`load` option). Rejects when the host gave none. */
  load: (file: string) => Promise<unknown>;
  /** Asks the host to open something the block refers to (`onOpen` option). */
  onOpen: (target: unknown) => void;
  /** Aborted when the block changes, re-renders or leaves the document. */
  signal: AbortSignal;
};
/** Renders a fenced code block the package does not know, e.g. ```codaru-mockup. */
export type BlockEnhancer = {
  language: string;
  render: (code: string, ctx: BlockContext) => HTMLElement | Promise<HTMLElement>;
  /** Header label. Defaults to the language. */
  label?: string;
};
export type BlockHost = {
  enhancers?: BlockEnhancer[];
  load?: (file: string, language: string) => Promise<unknown>;
  onOpen?: (target: unknown, language: string) => void;
};
export const themeEvent = "planning:theme";
const languageOf = (node: ProseNode) => String(node.attrs.language ?? "").trim().toLowerCase();
export const enhancerFor = (enhancers: BlockEnhancer[] | undefined, node: { type: { name: string }; attrs: Record<string, unknown> }) =>
  node.type.name === "code_block" ? enhancers?.find(e => e.language.trim().toLowerCase() === String(node.attrs.language ?? "").trim().toLowerCase()) : undefined;

/** The host's element replaces the code; the text stays as the source of truth and as the fallback. */
export class EnhancedBlockView implements NodeView {
  dom = document.createElement("div");
  contentDOM = document.createElement("code");
  private header = document.createElement("div");
  private preview = document.createElement("div");
  private status = document.createElement("div");
  private source = document.createElement("pre");
  private toggle = document.createElement("button");
  private sourceOpen = false;
  private failed = false;
  private alive = true;
  private revision = 0;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private rerender = () => this.schedule(0);
  private root?: Element | null;
  private scheme?: "light" | "dark";
  private appearance?: MutationObserver;

  constructor(private node: ProseNode, private view: EditorView, private getPos: () => number | undefined,
    decorations: readonly Decoration[], private enhancer: BlockEnhancer, private host: BlockHost) {
    const language = languageOf(node);
    this.dom.className = "enhanced-block code-block";
    this.dom.dataset.language = language;
    this.header.className = "enhanced-header code-block-header";
    this.header.contentEditable = "false";
    const label = document.createElement("span");
    label.className = "enhanced-label";
    label.textContent = enhancer.label ?? language;
    this.toggle.type = "button";
    this.toggle.onclick = () => this.toggleSource();
    this.header.append(label, this.toggle);
    this.preview.className = "enhanced-preview";
    this.preview.contentEditable = "false";
    this.status.className = "enhanced-status";
    this.status.setAttribute("role", "status");
    this.source.className = "enhanced-source";
    this.contentDOM.className = `language-${language}`;
    this.contentDOM.spellcheck = false;
    this.source.append(this.contentDOM);
    this.dom.append(this.header, this.preview, this.status, this.source);
    this.syncSource(decorations);
    queueMicrotask(() => {
      if (!this.alive) return;
      this.root = this.dom.closest(".codaru-planning");
      this.root?.addEventListener(themeEvent, this.rerender);
      // The host may switch light/dark on any ancestor: re-render only when the scheme really changes.
      this.appearance = new MutationObserver(() => { if (this.currentScheme() !== this.scheme) this.schedule(0); });
      for (let parent: HTMLElement | null = this.dom; parent; parent = parent.parentElement)
        this.appearance.observe(parent, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });
    });
    this.schedule(0);
  }
  private syncSource(decorations: readonly Decoration[]) {
    const visible = this.failed || this.sourceOpen || decorations.some(d => d.spec.mermaidSource);
    this.source.hidden = !visible;
    this.toggle.hidden = this.failed;
    this.toggle.textContent = visible ? "Ocultar fuente" : "Fuente";
    this.toggle.setAttribute("aria-expanded", String(visible));
  }
  private toggleSource() {
    this.sourceOpen = Boolean(this.source.hidden);
    const pos = this.getPos();
    if (pos !== undefined && this.view.editable) {
      this.view.dispatch(this.view.state.tr.setSelection(this.sourceOpen
        ? TextSelection.create(this.view.state.doc, pos + 1)
        : NodeSelection.create(this.view.state.doc, pos)));
      if (this.sourceOpen) this.view.focus();
    }
    this.syncSource([]);
  }
  private schedule(delay = 250) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.render(), delay);
  }
  private async render() {
    const revision = ++this.revision;
    this.controller?.abort();
    const controller = this.controller = new AbortController();
    const language = languageOf(this.node);
    const theme = this.scheme = this.currentScheme();
    const ctx: BlockContext = {
      language, readOnly: !this.view.editable, signal: controller.signal, theme,
      load: file => this.host.load ? this.host.load(file, language) : Promise.reject(new Error("El host no proporcionó load para este bloque.")),
      onOpen: target => this.host.onOpen?.(target, language),
    };
    this.dom.dataset.preview = "loading";
    try {
      const element = await this.enhancer.render(this.node.textContent, ctx);
      if (!this.alive || revision !== this.revision) return;
      if (!(element instanceof HTMLElement)) throw new Error("El renderizador no devolvió un elemento.");
      this.preview.replaceChildren(element);
      this.failed = false;
      this.status.hidden = true;
      this.dom.dataset.preview = "ready";
    } catch (error) {
      if (!this.alive || revision !== this.revision || controller.signal.aborted) return;
      // A failing block keeps its text with a note; the rest of the document is unaffected.
      this.preview.replaceChildren();
      this.failed = true;
      this.status.hidden = false;
      this.status.textContent = `No se pudo mostrar el bloque «${language}»: ${error instanceof Error ? error.message : String(error)}. Se muestra el texto original.`;
      this.dom.dataset.preview = "error";
    }
    this.syncSource([]);
  }
  private currentScheme(): "light" | "dark" {
    const scheme = getComputedStyle(this.dom).colorScheme || "";
    return /dark/.test(scheme) && !/light/.test(scheme) ? "dark" : "light";
  }
  update(node: ProseNode, decorations: readonly Decoration[]) {
    if (node.type !== this.node.type || languageOf(node) !== languageOf(this.node)) return false;
    const changed = node.textContent !== this.node.textContent;
    this.node = node;
    this.syncSource(decorations);
    if (changed) this.schedule();
    return true;
  }
  stopEvent(event: Event) {
    return this.header.contains(event.target as Node) || this.preview.contains(event.target as Node);
  }
  ignoreMutation(mutation: ViewMutationRecord) {
    return mutation.type !== "selection" && !this.contentDOM.contains(mutation.target);
  }
  destroy() {
    this.alive = false;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.root?.removeEventListener(themeEvent, this.rerender);
    this.appearance?.disconnect();
  }
}
