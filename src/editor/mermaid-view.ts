import type { Node as ProseNode } from "prosemirror-model";
import { NodeSelection, Plugin, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView, type NodeView, type ViewMutationRecord } from "prosemirror-view";
import { isMermaid } from "./mermaid-source";
import type { mountMermaidPreview } from "./mermaid-preview";

// Entering a hidden source with arrow keys must reveal the caret, including in history.
export function mermaidSourceSelection() {
  return new Plugin({ props: { decorations(state) {
    const { selection } = state;
    if (!(selection instanceof TextSelection)) return null;
    const ranges: Decoration[] = [];
    state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (isMermaid(node)) ranges.push(Decoration.node(pos, pos + node.nodeSize,
        { class: "mermaid-source-active" }, { mermaidSource: true }));
    });
    return DecorationSet.create(state.doc, ranges);
  } } });
}

export class MermaidView implements NodeView {
  dom = document.createElement("div");
  contentDOM = document.createElement("code");
  private header = document.createElement("div");
  private preview = document.createElement("div");
  private canvas = document.createElement("div");
  private status = document.createElement("div");
  private source = document.createElement("pre");
  private toggle = document.createElement("button");
  private fit = document.createElement("button");
  private edit = document.createElement("button");
  private closeDesigner?: () => void;
  private sourceOpen = false;
  private alive = true;
  private revision = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private renderer?: ReturnType<typeof mountMermaidPreview>;

  constructor(private node: ProseNode, private view: EditorView,
    private getPos: () => number | undefined, decorations: readonly Decoration[]) {
    this.dom.className = "mermaid-block code-block";
    this.header.className = "mermaid-header code-block-header";
    this.header.contentEditable = "false";
    const label = document.createElement("span");
    label.className = "mermaid-label";
    label.textContent = "Diagrama";
    const badge = document.createElement("span");
    badge.className = "mermaid-badge";
    badge.textContent = "Kairo";
    this.toggle.type = this.fit.type = this.edit.type = "button";
    this.edit.textContent = "Editar en Kairo";
    this.edit.hidden = !view.editable;
    this.edit.onclick = () => { void this.openDesigner(); };
    this.toggle.onclick = () => this.toggleSource();
    this.fit.textContent = "Ajustar";
    this.fit.setAttribute("aria-label", "Ajustar diagrama");
    this.fit.onclick = () => this.renderer?.fit();
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copiar";
    copy.setAttribute("aria-label", "Copiar Mermaid");
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(this.node.textContent);
        if (this.alive) copy.textContent = "Copiado";
      } catch {
        if (this.alive) { this.sourceOpen = true; this.syncSource([]); }
      }
    };
    this.header.append(label, badge, this.edit, this.toggle, this.fit, copy);
    this.preview.contentEditable = "false";
    this.preview.className = "mermaid-preview";
    this.canvas.className = "mermaid-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", "Vista previa del diagrama con Kairo");
    this.status.className = "mermaid-status";
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    const hint = document.createElement("div");
    hint.className = "mermaid-hint";
    hint.textContent = "Arrastra para mover · ⌘ +/− o pellizca para zoom";
    this.preview.append(this.canvas, this.status, hint);
    this.source.className = "mermaid-source";
    this.contentDOM.className = "language-mermaid";
    this.contentDOM.spellcheck = false;
    this.contentDOM.setAttribute("aria-label", "Fuente Mermaid");
    this.source.append(this.contentDOM);
    this.dom.append(this.header, this.preview, this.source);
    this.syncSource(decorations);
    this.scheduleRender(0);
  }
  private syncSource(decorations: readonly Decoration[]) {
    const visible = this.sourceOpen || decorations.some(d => d.spec.mermaidSource);
    this.source.hidden = !visible;
    this.toggle.textContent = visible ? "Ocultar fuente" : "Fuente Mermaid";
    this.toggle.setAttribute("aria-expanded", String(visible));
  }
  private toggleSource() {
    const pos = this.getPos();
    this.sourceOpen = Boolean(this.source.hidden);
    if (pos !== undefined && this.view.editable) {
      this.view.dispatch(this.view.state.tr.setSelection(this.sourceOpen
        ? TextSelection.create(this.view.state.doc, pos + 1)
        : NodeSelection.create(this.view.state.doc, pos)));
      if (this.sourceOpen) this.view.focus();
    }
    this.syncSource([]);
  }
  private scheduleRender(delay = 250) {
    clearTimeout(this.timer);
    const revision = ++this.revision;
    this.status.textContent = "Actualizando vista previa…";
    this.status.hidden = false;
    this.dom.dataset.preview = "loading";
    this.fit.disabled = true;
    this.edit.disabled = true;
    this.timer = setTimeout(async () => {
      try {
        const { mountMermaidPreview } = await import("./mermaid-preview");
        if (!this.alive || revision !== this.revision) return;
        this.renderer ||= mountMermaidPreview(this.canvas);
        this.canvas.hidden = false;
        const notice = this.renderer.render(this.node.textContent, this.node.attrs.kairoLayout);
        this.status.textContent = notice;
        this.status.hidden = !notice;
        this.dom.dataset.preview = "ready";
        this.fit.disabled = false;
        this.edit.disabled = false;
      } catch (error) {
        if (!this.alive || revision !== this.revision) return;
        this.canvas.hidden = true;
        this.dom.dataset.preview = "error";
        this.status.textContent = error instanceof Error ? error.message : "No se pudo mostrar el diagrama en Kairo. La fuente se conserva.";
      }
    }, delay);
  }
  private async openDesigner() {
    this.edit.disabled = true;
    try {
      const [{ openMermaidDesigner }, { applyMermaidEdit }] = await Promise.all([
        import("./mermaid-designer"), import("./mermaid-editing"),
      ]);
      if (!this.alive || !this.view.editable) return;
      const expected = this.node.textContent;
      this.closeDesigner?.();
      this.closeDesigner = openMermaidDesigner(expected, this.node.attrs.kairoLayout, edit => {
        const pos = this.getPos();
        if (!this.alive || pos === undefined) throw new Error("Este bloque ya no está disponible.");
        this.sourceOpen = false;
        this.view.dispatch(applyMermaidEdit(this.view.state, pos, expected, edit));
      });
    } catch (problem) {
      if (this.alive) {
        this.status.hidden = false;
        this.status.textContent = problem instanceof Error ? problem.message : "No se pudo abrir Kairo.";
      }
    } finally { if (this.alive) this.edit.disabled = false; }
  }
  update(node: ProseNode, decorations: readonly Decoration[]) {
    if (!isMermaid(node)) return false;
    const changed = node.textContent !== this.node.textContent || node.attrs.kairoLayout !== this.node.attrs.kairoLayout;
    this.node = node;
    this.syncSource(decorations);
    if (changed) this.scheduleRender();
    return true;
  }
  stopEvent(event: Event) {
    return this.header.contains(event.target as Node) || this.preview.contains(event.target as Node);
  }
  ignoreMutation(mutation: ViewMutationRecord) {
    return mutation.type !== "selection" &&
      (mutation.target === this.dom || mutation.target === this.source || !this.contentDOM.contains(mutation.target));
  }
  destroy() {
    this.alive = false;
    clearTimeout(this.timer);
    this.closeDesigner?.();
    this.renderer?.destroy();
  }
}
