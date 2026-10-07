import {
  splitListItem,
  sinkListItem,
  liftListItem,
} from "prosemirror-schema-list";
import {
  EditorState,
  Plugin,
  Selection,
  type Command,
} from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { Fragment, Slice } from "prosemirror-model";
import {
  baseKeymap,
  toggleMark,
  chainCommands,
  exitCode,
} from "prosemirror-commands";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
  tableEditing,
  columnResizing,
  goToNextCell,
  addRowAfter,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  toggleHeaderRow,
  isInTable,
} from "prosemirror-tables";
import { plain, markdown, type RichNode } from "../../../planning-core/src/index.js";
import { icon as defaultIcon, esc, type IconRenderer } from "./icons.js";
import { fromMarkdown, safeHref, validateDocument } from "../documents.js";
import { schema, validContent } from "./schema.js";
import {
  blockTypes,
  blockAt,
  slashMatch,
  changeBlock,
  insertParagraphAfter,
  duplicateBlock,
  deleteBlock,
  moveBlock,
  moveBlockTo,
  type BlockKind,
  type SlashMatch,
} from "./editor/blocks.js";
import { bindNavigation } from "./navigation.js";
import { CodeView, TaskItemView, codeHighlighting } from "./editor/code.js";
import { isMermaid, extractMermaidFence } from "./editor/mermaid-source.js";
import { MermaidView, mermaidSourceSelection } from "./editor/mermaid-view.js";
import { EnhancedBlockView, enhancerFor, themeEvent, type BlockEnhancer } from "./editor/enhancer.js";
export type { BlockEnhancer, BlockContext } from "./editor/enhancer.js";
export { validContent } from "./schema.js";

export type EditorCommand = "bold" | "italic" | "inline-code" | "undo" | "redo" | "row" | "column" | "delete-row" | "delete-column" | "delete-table" | "header";
export type EditorSnapshot = {
  readOnly: boolean; canUndo: boolean; canRedo: boolean; inTable: boolean;
  bold: boolean; italic: boolean; inlineCode: boolean; words: number; characters: number; zoom: number;
};
export type EditorOptions = {
  readOnly?: boolean;
  /** false hides default controls. An element mounts them outside the document. */
  toolbar?: false | HTMLElement;
  tableToolbar?: false | HTMLElement;
  footer?: false | HTMLElement;
  blockGutter?: boolean;
  placeholder?: string;
  label?: string;
  /** Trusted host markup. Defaults to inline SVG with no external assets. */
  icon?: IconRenderer;
  /** Renderers for fenced blocks, by language. They take precedence over the built-in ones, Mermaid included. */
  enhancers?: BlockEnhancer[];
  /** Given to enhancers as ctx.load. */
  load?: (file: string, language: string) => Promise<unknown>;
  /** Given to enhancers as ctx.onOpen. */
  onOpen?: (target: unknown, language: string) => void;
  /** Called for safe links (http, https, mailto, relative paths). Links never navigate the page by themselves. */
  onOpenLink?: (href: string) => void;
};
export type CreateEditorOptions = EditorOptions & {
  content?: RichNode;
  markdown?: string;
  onChange?: (content: RichNode) => void;
};
const inlineCommands: Record<string, Command> = {
  bold: toggleMark(schema.marks.strong), italic: toggleMark(schema.marks.em),
  "inline-code": toggleMark(schema.marks.code), undo, redo,
};
let editorSerial = 0;
type MenuEntry = {
  id: string;
  title: string;
  description?: string;
  symbol: string;
  group?: string;
  disabled?: boolean;
};
type MenuState = {
  mode: "blocks" | "actions";
  query: string;
  selected: number;
  slash?: SlashMatch;
  index: number;
  anchor?: HTMLElement;
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
const tableCommands: Record<string, Command> = {
  row: addRowAfter,
  column: addColumnAfter,
  "delete-row": deleteRow,
  "delete-column": deleteColumn,
  "delete-table": deleteTable,
  header: toggleHeaderRow,
};

export class VisualEditor {
  view: EditorView;
  private root: HTMLElement;
  private shell: HTMLElement;
  private toolbar: HTMLElement;
  private tableTools: HTMLElement;
  private gutter: HTMLElement;
  private popup: HTMLElement;
  private options: HTMLElement;
  private search: HTMLInputElement;
  private footer: HTMLElement;
  private dropLine: HTMLElement;
  private menu?: MenuState;
  private entries: MenuEntry[] = [];
  private hovered?: number;
  private dragging?: number;
  private dropSlot?: number;
  private dismissedSlash = "";
  private frame = 0;
  private destroyed = false;
  private cleanupNavigation: () => void;
  private zoom = 1;
  private readonly: boolean;
  private config: EditorOptions;
  private listeners = new Set<(state: EditorSnapshot) => void>();
  private externalControls: HTMLElement[] = [];
  private change: (content: RichNode) => void;
  private applyZoom!: (value: number) => void;
  private editorId = `block-editor-${++editorSerial}`;

  constructor(
    mount: HTMLElement,
    content: RichNode,
    onChange: (content: RichNode) => void,
    options: boolean | EditorOptions = false,
  ) {
    // Validate before touching host DOM; each instance owns only its own roots.
    const initial = validContent(content);
    this.config = typeof options === "boolean" ? { readOnly: options } : options;
    this.readonly = !!this.config.readOnly;
    this.change = onChange;
    const readonly = this.readonly;
    const icon = this.config.icon || defaultIcon;
    const host = document.createElement("div");
    host.className = "codaru-planning";
    mount.append(host);
    this.root = host;
    host.classList.add("visual-editor", "block-editor");
    host.classList.toggle("readonly-editor", readonly);
    host.innerHTML = `<div class="block-toolbar" role="toolbar" aria-label="Formato del documento"><button type="button" class="insert-block-button" data-insert>${icon("new")}Insertar bloque <kbd>/</kbd></button><span class="toolbar-space"></span>${[
      ["bold", "Negrita ⌘B"],
      ["italic", "Cursiva ⌘I"],
      ["inline-code", "Código en línea"],
      ["undo", "Deshacer ⌘Z"],
      ["redo", "Rehacer ⇧⌘Z"],
    ]
      .map(
        ([cmd, label]) =>
          `<button type="button" class="icon-button" data-command="${cmd}" aria-label="${label}" title="${label}">${cmd === "inline-code" ? '<span aria-hidden="true">‹›</span>' : icon(cmd)}</button>`,
      )
      .join(
        "",
      )}</div><div class="table-tools" role="toolbar" aria-label="Editar tabla" hidden><span>Tabla</span><button type="button" data-table="row">+ Fila</button><button type="button" data-table="column">+ Columna</button><select aria-label="Acciones de la tabla"><option value="">Más opciones…</option value="header">Alternar encabezado</option><option value="delete-row">Eliminar fila</option><option value="delete-column">Eliminar columna</option><option value="delete-table">Eliminar tabla</option></select></div><div class="block-document"><div class="block-gutter" hidden><button type="button" data-block-add aria-label="Insertar bloque debajo" title="Insertar bloque debajo">${icon("new")}</button><button type="button" data-block-menu draggable="true" aria-label="Acciones del bloque" title="Acciones del bloque · arrastra para mover"><span aria-hidden="true">⠿</span></button></div><div class="block-canvas"></div><div class="block-drop-line" hidden></div></div><div class="block-footer"><span data-count></span><span class="editor-hint">/ para insertar · ⌘ +/− para zoom</span><button type="button" class="zoom-reset" aria-label="Restablecer zoom del documento" title="⌘0 · Restablecer zoom">100%</button></div><div class="block-popup" tabindex="-1" hidden><input class="block-search" placeholder="Buscar un bloque…" aria-label="Buscar tipo de bloque"><div class="block-options" id="${this.editorId}-options" role="listbox" aria-label="Tipos de bloque"></div><div class="block-popup-hint">↑↓ navegar <span>↵ insertar · esc cerrar</span></div></div>`;
    this.shell = host.querySelector(".block-document")!;
    this.toolbar = host.querySelector(".block-toolbar")!;
    this.tableTools = host.querySelector(".table-tools")!;
    this.gutter = host.querySelector(".block-gutter")!;
    this.popup = host.querySelector(".block-popup")!;
    this.search = host.querySelector(".block-search")!;
    this.options = host.querySelector(".block-options")!;
    this.footer = host.querySelector(".block-footer")!;
    this.dropLine = host.querySelector(".block-drop-line")!;
    this.toolbar.hidden = readonly;
    this.view = new EditorView(host.querySelector(".block-canvas")!, {
      state: EditorState.create({
        schema,
        doc: initial,
        plugins: [
          history(),
          keymap({
            "Mod-z": undo,
            "Mod-Shift-z": redo,
            "Mod-y": redo,
            "Mod-b": toggleMark(schema.marks.strong),
            "Mod-i": toggleMark(schema.marks.em),
            "Mod-Enter": chainCommands(exitCode, insertParagraphAfter()),
            "Alt-Shift-ArrowUp": moveBlock(-1),
            "Alt-Shift-ArrowDown": moveBlock(1),
            Enter: chainCommands(
              splitListItem(schema.nodes.task_item, { checked: false }),
              splitListItem(schema.nodes.list_item),
            ),
            Tab: chainCommands(
              goToNextCell(1),
              sinkListItem(schema.nodes.task_item),
              sinkListItem(schema.nodes.list_item),
            ),
            "Shift-Tab": chainCommands(
              goToNextCell(-1),
              liftListItem(schema.nodes.task_item),
              liftListItem(schema.nodes.list_item),
            ),
          }),
          keymap(baseKeymap),
          codeHighlighting(),
          mermaidSourceSelection(node => isMermaid(node) || !!enhancerFor(this.config.enhancers, node)),
          new Plugin({
            props: {
              decorations: (state) => {
                if (readonly) return null;
                const decorations: Decoration[] = [];
                state.doc.forEach((node, pos) => {
                  if (
                    node.type === schema.nodes.paragraph &&
                    !node.content.size
                  )
                    decorations.push(
                      Decoration.node(pos, pos + node.nodeSize, {
                        "data-placeholder":
                          this.config.placeholder ?? "Escribe algo o usa / para insertar un bloque",
                        class: "empty-block",
                      }),
                    );
                });
                return DecorationSet.create(state.doc, decorations);
              },
            },
          }),
          ...(!readonly
            ? [columnResizing({ cellMinWidth: 70, defaultCellMinWidth: 110 })]
            : []),
          tableEditing(),
        ],
      }),
      editable: () => !readonly,
      nodeViews: {
        code_block: (node, view, getPos, decorations) => {
          const enhancer = enhancerFor(this.config.enhancers, node);
          if (enhancer) return new EnhancedBlockView(node, view, getPos, decorations, enhancer, this.config);
          return isMermaid(node) ? new MermaidView(node, view, getPos, decorations) : new CodeView(node, view, getPos, icon);
        },
        task_item: (node, view, getPos) => new TaskItemView(node, view, getPos),
      },
      attributes: {
        role: "textbox",
        "aria-label": this.config.label ?? (readonly
          ? "Contenido del documento"
          : "Contenido de la tarjeta"),
        "aria-multiline": "true",
        spellcheck: "true",
      },
      dispatchTransaction: (tr) => {
        const result = this.view.state.applyTransaction(tr);
        this.view.updateState(result.state);
        if (result.transactions.some((t) => t.docChanged))
          this.change(result.state.doc.toJSON());
        if (tr.selectionSet) this.hovered = undefined;
        this.updateUI();
      },
      handleKeyDown: (_view, event) => this.handleMenuKey(event),
      handlePaste: (view, event) => {
        if (readonly || view.state.selection.$from.parent.type === schema.nodes.code_block) return false;
        const source = extractMermaidFence(event.clipboardData?.getData("text/plain") || "");
        if (source === undefined) return false;
        view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray([
          schema.nodes.code_block.create({ language: "mermaid" }, source ? schema.text(source) : null),
          schema.nodes.paragraph.create(),
        ]), 0, 0)).scrollIntoView());
        return true;
      },
      handleDOMEvents: {
        click: (_view, event) => {
          const link = (event.target as Element).closest("a");
          if (link) {
            event.preventDefault();
            const href = link.getAttribute("href");
            if (href && safeHref(href)) this.config.onOpenLink?.(href);
            return true;
          }
          return false;
        },
        auxclick: (_view, event) => { if ((event.target as Element).closest("a")) { event.preventDefault(); return true; } return false; },
        dragover: (_view, event) => this.dragOver(event),
        drop: (_view, event) => this.drop(event),
      },
    });
    const canvas = host.querySelector<HTMLElement>(".block-canvas")!;
    const zoomButton = host.querySelector<HTMLButtonElement>(".zoom-reset")!;
    const setZoom = (zoom: number) => {
      this.zoom = zoom;
      canvas.style.setProperty("--document-zoom", String(zoom));
      zoomButton.textContent = `${Math.round(zoom * 100)}%`;
      zoomButton.setAttribute(
        "aria-label",
        `Restablecer zoom del documento · ${Math.round(zoom * 100)} %`,
      );
      this.schedulePosition();
      this.notifyState();
    };
    this.applyZoom = setZoom;
    zoomButton.onclick = () => setZoom(1);
    this.cleanupNavigation = bindNavigation(host, {
      getZoom: () => this.zoom,
      setZoom,
    });
    if (!readonly) this.bind();
    for (const [element, target] of [
      [this.toolbar, this.config.toolbar], [this.tableTools, this.config.tableToolbar], [this.footer, this.config.footer],
    ] as const) {
      if (target === false) element.hidden = true;
      else if (target instanceof HTMLElement) {
        const wrapper = document.createElement("div");
        wrapper.className = "codaru-planning block-editor editor-controls";
        wrapper.append(element);
        target.append(wrapper);
        this.externalControls.push(wrapper);
      }
    }
    this.updateUI();
  }

  private bind() {
    this.toolbar
      .querySelectorAll<HTMLButtonElement>("[data-command]")
      .forEach((button) => {
        button.onmousedown = (e) => e.preventDefault();
        button.onclick = () => {
          this.closeMenu();
          this.execute(button.dataset.command as EditorCommand);
        };
      });
    const insert =
      this.toolbar.querySelector<HTMLButtonElement>("[data-insert]")!;
    insert.onmousedown = (e) => e.preventDefault();
    insert.onclick = () => this.insertAndChoose(undefined, insert);
    const add =
      this.gutter.querySelector<HTMLButtonElement>("[data-block-add]")!;
    add.onmousedown = (e) => e.preventDefault();
    add.onclick = () => this.insertAndChoose(this.activeBlock()?.index, add);
    const grip =
      this.gutter.querySelector<HTMLButtonElement>("[data-block-menu]")!;
    grip.onclick = () => {
      const block = this.activeBlock();
      if (!block) return;
      this.menu = {
        mode: "actions",
        query: "",
        selected: 0,
        index: block.index,
        anchor: grip,
      };
      this.showMenu();
      this.popup.focus();
    };
    grip.ondragstart = (e) => {
      const block = this.activeBlock();
      if (!block) return;
      this.closeMenu();
      this.dragging = block.index;
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", block.node.textContent);
      e.dataTransfer!.setData("application/x-codaru-block", this.editorId);
    };
    grip.ondragend = () => {
      this.dragging = undefined;
      this.dropSlot = undefined;
      this.dropLine.hidden = true;
    };
    this.root.addEventListener("mousemove", this.onHover);
    this.root.addEventListener("mouseleave", this.onLeave);
    this.root.addEventListener("focusin", this.schedulePosition);
    this.search.oninput = () => {
      if (!this.menu) return;
      this.menu.query = this.search.value;
      this.menu.selected = 0;
      this.renderOptions();
      this.positionMenu();
    };
    this.search.onkeydown = (e) => {
      if (this.handleMenuKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    this.popup.addEventListener("keydown", (e) => {
      if (e.target === this.search) return;
      if (this.handleMenuKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    this.tableTools
      .querySelectorAll<HTMLButtonElement>("[data-table]")
      .forEach((button) => {
        button.onmousedown = (e) => e.preventDefault();
        button.onclick = () => this.run(tableCommands[button.dataset.table!]);
      });
    const actions = this.tableTools.querySelector("select")!;
    actions.onchange = () => {
      const cmd = tableCommands[actions.value];
      actions.value = "";
      if (cmd) this.run(cmd);
    };
    document.addEventListener("pointerdown", this.onOutside);
    window.addEventListener("scroll", this.schedulePosition, true);
    window.addEventListener("resize", this.schedulePosition);
  }
  private run(command: Command) {
    if (this.destroyed || this.readonly) return false;
    const applied = command(this.view.state, this.view.dispatch, this.view);
    this.view.focus();
    this.updateUI();
    return applied;
  }
  private activeBlock() {
    return blockAt(this.view.state, this.hovered);
  }
  private insertAndChoose(index?: number, anchor?: HTMLElement) {
    this.closeMenu();
    const block = blockAt(this.view.state, index);
    if (
      block &&
      !(block.node.type === schema.nodes.paragraph && !block.node.content.size)
    )
      this.run(insertParagraphAfter(block.index));
    else if (block)
      this.view.dispatch(
        this.view.state.tr.setSelection(
          Selection.near(this.view.state.doc.resolve(block.pos + 1)),
        ),
      );
    this.menu = {
      mode: "blocks",
      query: "",
      selected: 0,
      index: blockAt(this.view.state)!.index,
      anchor,
    };
    this.showMenu();
    this.search.focus();
  }
  private updateUI() {
    const state = this.view.state;
    const text = plain(state.doc.toJSON());
    this.footer.querySelector("[data-count]")!.textContent =
      `${text.match(/[\p{L}\p{N}]+/gu)?.length || 0} palabras · ${[...text].length} caracteres`;
    this.notifyState();
    if (this.readonly) return;
    for (const [name, mark] of [
      ["bold", schema.marks.strong],
      ["italic", schema.marks.em],
      ["inline-code", schema.marks.code],
    ] as const) {
      const active = state.selection.empty
        ? !!mark.isInSet(state.storedMarks || state.selection.$from.marks())
        : state.doc.rangeHasMark(
            state.selection.from,
            state.selection.to,
            mark,
          );
      this.toolbar
        .querySelector(`[data-command="${name}"]`)!
        .setAttribute("aria-pressed", String(active));
    }
    for (const [name, command] of [
      ["undo", undo],
      ["redo", redo],
    ] as const)
      this.toolbar.querySelector<HTMLButtonElement>(
        `[data-command="${name}"]`,
      )!.disabled = !command(state);
    this.tableTools.hidden = this.config.tableToolbar === false || !isInTable(state);
    if (!this.view.composing) {
      const match = slashMatch(state);
      const signature = match ? `${match.from}:${match.to}:${match.query}` : "";
      if (
        match &&
        signature !== this.dismissedSlash &&
        (!this.menu || this.menu.slash)
      ) {
        const previous = this.menu;
        this.menu = {
          mode: "blocks",
          query: match.query,
          selected: previous?.query === match.query ? previous.selected : 0,
          slash: match,
          index: blockAt(state)!.index,
        };
        this.showMenu();
      } else if (this.menu?.slash && !match) this.closeMenu();
      if (!match) this.dismissedSlash = "";
    }
    this.schedulePosition();
  }
  private showMenu() {
    this.popup.hidden = false;
    this.search.hidden = !!this.menu?.slash || this.menu?.mode === "actions";
    if (!this.search.hidden && document.activeElement !== this.search)
      this.search.value = this.menu?.query || "";
    this.options.setAttribute(
      "role",
      this.menu?.mode === "actions" ? "menu" : "listbox",
    );
    this.options.setAttribute(
      "aria-label",
      this.menu?.mode === "actions" ? "Acciones del bloque" : "Tipos de bloque",
    );
    this.renderOptions();
    this.positionMenu();
  }
  private renderOptions() {
    if (!this.menu) return;
    if (this.menu.mode === "actions") {
      this.entries = [
        { id: "convert", title: "Convertir en…", symbol: "¶" },
        { id: "duplicate", title: "Duplicar bloque", symbol: "⧉" },
        {
          id: "up",
          title: "Mover arriba",
          description: "⌥⇧↑",
          symbol: "↑",
          disabled: this.menu.index === 0,
        },
        {
          id: "down",
          title: "Mover abajo",
          description: "⌥⇧↓",
          symbol: "↓",
          disabled: this.menu.index === this.view.state.doc.childCount - 1,
        },
        {
          id: "delete",
          title: "Eliminar bloque",
          description: "Puedes deshacer con ⌘Z",
          symbol: "×",
        },
      ];
    } else {
      const q = normalize(this.menu.query);
      this.entries = blockTypes.filter((b) =>
        normalize(`${b.title} ${b.description} ${b.keywords} ${b.id}`).includes(
          q,
        ),
      );
    }
    this.menu.selected = Math.min(
      this.menu.selected,
      Math.max(0, this.entries.length - 1),
    );
    let group = "";
    this.options.innerHTML =
      this.entries
        .map((entry, index) => {
          let label = "";
          if (entry.group && entry.group !== group) {
            group = entry.group;
            label = `<div class="block-menu-group">${group}</div>`;
          }
          return `${label}<button type="button" role="${this.menu!.mode === "actions" ? "menuitem" : "option"}" id="${this.editorId}-option-${index}" data-choice="${index}" ${this.menu!.mode === "blocks" ? `aria-selected="${index === this.menu!.selected}"` : ""} class="block-option ${index === this.menu!.selected ? "is-active" : ""}" ${entry.disabled ? "disabled" : ""} tabindex="-1"><span class="block-kind-symbol" aria-hidden="true">${entry.symbol}</span><span><strong>${esc(entry.title)}</strong>${entry.description ? `<small>${esc(entry.description)}</small>` : ""}</span></button>`;
        })
        .join("") ||
      '<p class="no-block-results">No se encontraron bloques.</p>';
    this.options
      .querySelectorAll<HTMLButtonElement>("[data-choice]")
      .forEach((button) => {
        button.onmousedown = (e) => e.preventDefault();
        button.onclick = () => this.choose(Number(button.dataset.choice));
      });
    if (this.menu.slash) {
      this.view.dom.setAttribute("aria-controls", this.options.id);
      this.view.dom.setAttribute(
        "aria-activedescendant",
        `${this.editorId}-option-${this.menu.selected}`,
      );
    }
  }
  private choose(index: number) {
    if (!this.menu || !this.entries[index] || this.entries[index].disabled)
      return;
    const menu = this.menu,
      entry = this.entries[index];
    this.closeMenu();
    if (menu.mode === "actions") {
      if (entry.id === "convert") {
        const block = blockAt(this.view.state, menu.index)!;
        const tr = this.view.state.tr.setSelection(
          Selection.near(this.view.state.doc.resolve(block.pos + 1)),
        );
        this.view.dispatch(tr);
        this.menu = {
          mode: "blocks",
          query: "",
          selected: 0,
          index: menu.index,
          anchor: menu.anchor,
        };
        this.showMenu();
        this.search.focus();
        return;
      }
      const commands: Record<string, Command> = {
        duplicate: duplicateBlock(menu.index),
        up: moveBlock(-1, menu.index),
        down: moveBlock(1, menu.index),
        delete: deleteBlock(menu.index),
      };
      this.run(commands[entry.id]);
    } else {
      const applied = this.run(changeBlock(entry.id as BlockKind, menu.slash));
      if (!applied && entry.id !== "paragraph")
        this.footer.querySelector("[data-count]")!.textContent =
          "No se puede convertir este contenido aquí. Inserta el bloque debajo.";
    }
  }
  private handleMenuKey(event: KeyboardEvent) {
    if (!this.menu || event.isComposing) return false;
    if (event.key === "Escape") {
      this.closeMenu();
      this.view.focus();
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!this.entries.length) return true;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      let index = this.menu.selected;
      for (let n = 0; n < this.entries.length; n++) {
        index = (index + direction + this.entries.length) % this.entries.length;
        if (!this.entries[index].disabled) break;
      }
      this.menu.selected = index;
      this.renderOptions();
      this.options
        .querySelector(".is-active")
        ?.scrollIntoView({ block: "nearest" });
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      this.choose(this.menu.selected);
      return true;
    }
    return false;
  }
  private closeMenu() {
    const match = this.menu?.slash;
    if (match) this.dismissedSlash = `${match.from}:${match.to}:${match.query}`;
    this.menu = undefined;
    this.popup.hidden = true;
    this.view?.dom.removeAttribute("aria-controls");
    this.view?.dom.removeAttribute("aria-activedescendant");
  }
  private positionMenu() {
    if (!this.menu || this.popup.hidden) return;
    const anchor = this.menu.slash
      ? this.view.coordsAtPos(this.view.state.selection.from)
      : this.menu.anchor?.getBoundingClientRect() ||
        this.gutter.getBoundingClientRect();
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth,
      height = viewport?.height || window.innerHeight;
    const left = Math.max(12, Math.min(anchor.left, width - 314));
    this.popup.style.left = `${left}px`;
    this.popup.style.width = `${Math.min(302, width - 24)}px`;
    const below = height - anchor.bottom - 16,
      above = anchor.top - 16;
    const down = below >= 220 || below >= above;
    const available = Math.max(120, Math.min(440, down ? below : above));
    this.popup.style.maxHeight = `${available}px`;
    this.options.style.maxHeight = `${available - (this.search.hidden ? 40 : 85)}px`;
    const actual = Math.min(this.popup.scrollHeight, available);
    this.popup.style.top = `${Math.max(12, down ? anchor.bottom + 7 : anchor.top - actual - 7)}px`;
  }
  private positionGutter() {
    if (this.readonly || this.config.blockGutter === false) return;
    const block = this.activeBlock();
    if (!block) {
      this.gutter.hidden = true;
      return;
    }
    const dom = this.view.nodeDOM(block.pos);
    if (!(dom instanceof HTMLElement)) {
      this.gutter.hidden = true;
      return;
    }
    const box = dom.getBoundingClientRect(),
      shell = this.shell.getBoundingClientRect();
    this.gutter.hidden = false;
    this.gutter.style.top = `${box.top - shell.top + Math.min(8, box.height / 5)}px`;
  }
  private onHover = (event: MouseEvent) => {
    if (
      this.menu ||
      this.dragging !== undefined ||
      !(event.target instanceof Element) ||
      !this.view.dom.contains(event.target)
    )
      return;
    const found = this.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (!found) return;
    const pos = this.view.state.doc.resolve(found.pos);
    this.hovered = Math.min(pos.index(0), this.view.state.doc.childCount - 1);
    this.schedulePosition();
  };
  private onLeave = () => {
    if (!this.menu) {
      this.hovered = undefined;
      this.schedulePosition();
    }
  };
  private onOutside = (event: Event) => {
    const target = event.target as Element;
    if (
      !this.popup.contains(target) &&
      !(
        (this.root.contains(target) || this.externalControls.some(root => root.contains(target))) &&
        target.closest("[data-insert], [data-block-add], [data-block-menu]")
      )
    )
      this.closeMenu();
  };
  private schedulePosition = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (!this.destroyed) {
        this.positionGutter();
        this.positionMenu();
      }
    });
  };
  private dragOver(event: DragEvent) {
    if (this.dragging === undefined) return false;
    event.preventDefault();
    event.dataTransfer!.dropEffect = "move";
    const state = this.view.state;
    let slot = state.doc.childCount,
      y = this.view.dom.getBoundingClientRect().bottom;
    for (let index = 0; index < state.doc.childCount; index++) {
      const block = blockAt(state, index)!;
      const dom = this.view.nodeDOM(block.pos) as HTMLElement;
      const rect = dom.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        slot = index;
        y = rect.top;
        break;
      }
      y = rect.bottom;
    }
    this.dropSlot = slot;
    this.dropLine.hidden = false;
    this.dropLine.style.top = `${y - this.shell.getBoundingClientRect().top}px`;
    return true;
  }
  private drop(event: DragEvent) {
    if (this.dragging === undefined) return false;
    event.preventDefault();
    const index = this.dragging,
      slot = this.dropSlot;
    this.dragging = undefined;
    this.dropSlot = undefined;
    this.dropLine.hidden = true;
    if (slot !== undefined) this.run(moveBlockTo(index, slot));
    return true;
  }
  /** Low-level commands can also be composed with the exported ProseMirror schema. */
  execute(command: EditorCommand) {
    const action = inlineCommands[command] || tableCommands[command];
    return action ? this.run(action) : false;
  }
  can(command: EditorCommand) {
    return !this.destroyed && !this.readonly && !!(inlineCommands[command] || tableCommands[command])?.(this.view.state);
  }
  insertBlock(kind: BlockKind) {
    if (this.destroyed || this.readonly) return false;
    this.closeMenu();
    return this.run(changeBlock(kind));
  }
  openBlockMenu(anchor?: HTMLElement) {
    if (!this.destroyed && !this.readonly) this.insertAndChoose(undefined, anchor);
  }
  focus() { if (!this.destroyed) this.view.focus(); }
  getJSON(): RichNode { return this.view.state.doc.toJSON(); }
  getMarkdown() { return markdown(this.getJSON()); }
  /** External document replacements reset undo history, and do not emit onChange by default. */
  setContent(content: RichNode, options: { emit?: boolean } = {}) {
    if (this.destroyed) throw new Error("El editor fue destruido.");
    const doc = validContent(content);
    if (this.view.state.doc.eq(doc)) return;
    this.closeMenu();
    this.hovered = undefined;
    this.view.updateState(EditorState.create({ schema, doc, plugins: this.view.state.plugins }));
    this.updateUI();
    if (options.emit) this.change(this.getJSON());
  }
  setMarkdown(source: string, options: { emit?: boolean } = {}) { this.setContent(fromMarkdown(source), options); }
  setZoom(value: number) { if (!this.destroyed && Number.isFinite(value)) this.applyZoom(Math.max(0.6, Math.min(2, value))); }
  getState(): EditorSnapshot {
    const state = this.view.state;
    const active = (name: string) => state.selection.empty
      ? !!schema.marks[name].isInSet(state.storedMarks || state.selection.$from.marks())
      : state.doc.rangeHasMark(state.selection.from, state.selection.to, schema.marks[name]);
    const text = plain(state.doc.toJSON());
    return { readOnly: this.readonly, canUndo: this.can("undo"), canRedo: this.can("redo"), inTable: isInTable(state),
      bold: active("strong"), italic: active("em"), inlineCode: active("code"),
      words: text.match(/[\p{L}\p{N}]+/gu)?.length || 0, characters: [...text].length, zoom: this.zoom };
  }
  subscribe(listener: (state: EditorSnapshot) => void) {
    if (this.destroyed) throw new Error("El editor fue destruido.");
    this.listeners.add(listener);
    listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }
  private notifyState() { for (const listener of this.listeners) listener(this.getState()); }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cleanupNavigation();
    cancelAnimationFrame(this.frame);
    document.removeEventListener("pointerdown", this.onOutside);
    window.removeEventListener("scroll", this.schedulePosition, true);
    window.removeEventListener("resize", this.schedulePosition);
    this.root.removeEventListener("mousemove", this.onHover);
    this.root.removeEventListener("mouseleave", this.onLeave);
    this.root.removeEventListener("focusin", this.schedulePosition);
    this.view.destroy();
    this.externalControls.forEach(root => root.remove());
    this.listeners.clear();
    this.root.remove();
  }
}

export function createBlockEditor(host: HTMLElement, options: CreateEditorOptions = {}) {
  if (options.content && options.markdown !== undefined) throw new Error("Usa content o markdown, no ambos.");
  return new VisualEditor(host, options.content ?? fromMarkdown(options.markdown ?? ""), options.onChange ?? (() => {}), options);
}
export { schema } from "./schema.js";
export { blockTypes } from "./editor/blocks.js";
export type { BlockKind } from "./editor/blocks.js";

export type DocumentTheme = "light" | "dark" | Record<string, string>;
export type DocumentOptions = {
  markdown?: string;
  content?: RichNode;
  /** Documents are always read-only; the option exists for clarity. */
  readOnly?: true;
  enhancers?: BlockEnhancer[];
  /** "light" or "dark", or tokens such as { accent: "var(--codaru-accent)" } or { "--planning-surface": "#fff" }. */
  theme?: DocumentTheme;
  onOpenLink?: (href: string) => void;
  load?: (file: string, language: string) => Promise<unknown>;
  onOpen?: (target: unknown, language: string) => void;
  icon?: IconRenderer;
  label?: string;
  /** Extra class names for the document root. */
  className?: string;
};
export type DocumentView = {
  readonly element: HTMLElement;
  /** Changes what is given; enhancer, load and onOpen changes rebuild the document. */
  update: (options: Partial<DocumentOptions>) => void;
  destroy: () => void;
  getMarkdown: () => string;
};
const tokenName = (key: string) => key.startsWith("--") ? key : `--planning-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
/** Read-only document with the editor's rendering: tables, task lists, code, Mermaid with Kairo and host enhancers. No editing controls. */
export function mountDocument(host: HTMLElement, options: DocumentOptions): DocumentView {
  if (options.content && options.markdown !== undefined) throw new Error("Usa content o markdown, no ambos.");
  let current: DocumentOptions = { ...options };
  let applied: string[] = [];
  const parse = (o: DocumentOptions) => o.content ? validateDocument(o.content) : fromMarkdown(o.markdown ?? "");
  const create = () => new VisualEditor(host, parse(current), () => {}, {
    readOnly: true, toolbar: false, tableToolbar: false, footer: false, blockGutter: false,
    label: current.label ?? "Documento", icon: current.icon, enhancers: current.enhancers,
    load: current.load, onOpen: current.onOpen, onOpenLink: href => current.onOpenLink?.(href),
  });
  let editor = create();
  const root = () => (editor as unknown as { root: HTMLElement }).root;
  const style = () => {
    const element = root();
    element.classList.add("planning-document");
    for (const name of current.className?.split(/\s+/).filter(Boolean) ?? []) element.classList.add(name);
    for (const name of applied) element.style.removeProperty(name);
    applied = [];
    const theme = current.theme;
    if (theme === "light" || theme === "dark") element.dataset.theme = theme;
    else delete element.dataset.theme;
    if (theme && typeof theme === "object") for (const [key, value] of Object.entries(theme)) {
      if (typeof value !== "string" || /[;{}]/.test(value)) continue;
      const name = tokenName(key);
      element.style.setProperty(name, value);
      applied.push(name);
    }
    element.dispatchEvent(new Event(themeEvent));
  };
  style();
  return {
    get element() { return root(); },
    update(next) {
      if (next.content && next.markdown !== undefined) throw new Error("Usa content o markdown, no ambos.");
      const previous = current;
      current = { ...current, ...next, ...(next.markdown !== undefined ? { content: undefined } : next.content ? { markdown: undefined } : {}) };
      if (next.enhancers !== undefined && next.enhancers !== previous.enhancers || next.load !== undefined && next.load !== previous.load || next.onOpen !== undefined && next.onOpen !== previous.onOpen || next.icon !== undefined && next.icon !== previous.icon) {
        const placeholder = document.createComment("planning-document");
        root().replaceWith(placeholder);
        editor.destroy();
        editor = create();
        placeholder.replaceWith(root());
        applied = [];
      } else if (next.markdown !== undefined || next.content) editor.setContent(parse(current));
      style();
    },
    destroy() { editor.destroy(); },
    getMarkdown: () => editor.getMarkdown(),
  };
}
