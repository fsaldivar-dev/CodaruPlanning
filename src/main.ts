import { invoke } from "@tauri-apps/api/core";
import {
  createItem,
  setStatus,
  reviseKnowledge,
  addRelation,
  blockers,
  completionIssues,
  descendants,
  neighbors,
  plain,
  template,
  id,
  kindLabels,
  statuses,
  defaultSettings,
  validateWorkspace,
  exportItem,
  type Workspace,
  type Item,
  type Kind,
  type Status,
  type RichNode,
} from "@codaru/planning-core";
import { VisualEditor, validContent } from "./editor";
import {
  boardViewMarkup,
  knowledgeListMarkup,
  archiveMarkup,
  deliveriesMarkup,
  criteriaMarkup,
  relationsMarkup,
  itemHeaderMarkup,
  detailTabsMarkup,
  documentStateMarkup,
  evidenceMarkup,
  subtasksMarkup,
  contextMarkup,
  historyMarkup,
  propertiesMarkup,
  sidebarMarkup,
  windowToolbarMarkup,
  viewToolbarMarkup,
  viewTitles,
} from "@fsaldivar.dev/planning/components";
import "@fsaldivar.dev/planning/components.css";
import { zoomActiveSurface } from "./navigation";
import { icon, esc } from "./icons";
import * as storage from "./storage";
import "./style.css";

const app = document.getElementById("app")!;
let ws: Workspace;
let view: "board" | "knowledge" | "deliveries" | "graph" | "archive" = "board",
  selected: string | undefined,
  detailTab = "content",
  query = "",
  epicFilter = "all";
let editor: VisualEditor | undefined,
  modalEditor: VisualEditor | undefined,
  diagramCleanup: (() => void) | undefined,
  renderToken = 0;
let saveLabel = "Guardado localmente",
  saveError: string | undefined,
  toastTimer: ReturnType<typeof setTimeout>;
const $ = <T extends HTMLElement = HTMLElement>(
  selector: string,
  parent: ParentNode = app,
) => parent.querySelector<T>(selector)!;
const $$ = <T extends HTMLElement = HTMLElement>(
  selector: string,
  parent: ParentNode = app,
) => [...parent.querySelectorAll<T>(selector)];
const itemBy = (key: string) => ws.items.find((i) => i.id === key)!;
const shortId = (item: Item) =>
  `${item.kind === "knowledge" ? "DOC" : "P"}-${ws.items.indexOf(item) + 1}`;
const date = (value: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
const options = (list: Item[], value?: string) =>
  list
    .map(
      (i) =>
        `<option value="${i.id}" ${i.id === value ? "selected" : ""}>${esc(i.title)}</option>`,
    )
    .join("");
const commandButton = (
  label: string,
  action: string,
  symbol?: string,
  extra = "",
) =>
  `<button type="button" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ""}${label}</button>`;
function notify(message: string, error = false) {
  const toast = document.getElementById("toast")!;
  toast.textContent = message;
  toast.className = error ? "visible error" : "visible";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.className = ""), 6500);
}
function safe(action: () => unknown | Promise<unknown>) {
  try {
    Promise.resolve(action()).catch((e) =>
      notify(String(e).replace(/^Error: /, ""), true),
    );
  } catch (e) {
    notify(String(e).replace(/^Error: /, ""), true);
  }
}
function changed(item?: Item) {
  if (item) {
    item.updatedAt = new Date().toISOString();
    if (item.kind !== "knowledge") {
      for (const r of ws.relations.filter(
        (r) => r.source === item.id && r.type === "modifies",
      ))
        itemBy(r.target).freshness = "review";
    }
  }
  storage.changed();
}
function applyAppearance() {
  const s = ws.settings;
  const root = document.documentElement;
  const dark =
    s.theme === "dark" ||
    (s.theme === "system" && matchMedia("(prefers-color-scheme:dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  const accent = /^#[a-fA-F0-9]{6}$/.test(s.accent) ? s.accent : "#007aff";
  root.style.setProperty("--accent", accent);
  const rgb = [1, 3, 5]
    .map((n) => parseInt(accent.slice(n, n + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  root.style.setProperty(
    "--accent-ink",
    rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
      ? "#101014"
      : "#ffffff",
  );
  const fonts: Record<string, string> = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    rounded: "ui-rounded, -apple-system, sans-serif",
    serif: "ui-serif, Georgia, serif",
    mono: "ui-monospace, Menlo, monospace",
  };
  root.style.setProperty(
    "--font",
    fonts[s.font] ||
      `"${s.font.replace(/["\\;]/g, "")}", -apple-system, sans-serif`,
  );
  root.style.setProperty(
    "--font-size",
    `${Math.max(11, Math.min(18, s.fontSize))}px`,
  );
  root.dataset.density = s.density;
  root.classList.toggle("sidebar-hidden", !s.sidebar);
}
// Every piece below is the package's own markup: the application is one host among others.
function details(item: Item) {
  return `<div class="detail-layout"><div class="document-editor">${itemHeaderMarkup(ws, item, icon)}${detailTabsMarkup(ws, item, detailTab)}${
    detailTab === "content"
      ? `${documentStateMarkup(item, icon)}<div id="rich-editor"></div>${item.kind !== "knowledge" ? criteriaMarkup(item, icon) : ""}${evidenceMarkup(item, icon)}`
      : detailTab === "subtasks"
        ? subtasksMarkup(ws, item, icon)
        : detailTab === "context"
          ? `${relationsMarkup(ws, item, icon)}${contextMarkup(item, icon)}`
          : detailTab === "diagram"
            ? '<div id="diagram-host"></div>'
            : historyMarkup(item, icon)
  }</div>${propertiesMarkup(ws, item, icon)}</div>`;
}
function render() {
  const token = ++renderToken;
  editor?.destroy();
  editor = undefined;
  diagramCleanup?.();
  diagramCleanup = undefined;
  applyAppearance();
  const item = selected ? itemBy(selected) : undefined;
  app.innerHTML = `${windowToolbarMarkup(ws, { subtitle: item ? item.title : viewTitles[view], query }, icon)}<div class="app-shell">${sidebarMarkup(ws, { view, epicFilter, saveLabel, saveError: !!saveError }, icon)}<main class="main-content">${!item ? viewToolbarMarkup(ws, view, icon) : ""}<div class="view-content ${item ? "has-detail" : ""}">${item ? details(item) : view === "board" ? boardViewMarkup(ws, { query, epicFilter }, icon) : view === "knowledge" ? knowledgeListMarkup(ws, query, icon) : view === "deliveries" ? deliveriesMarkup(ws, icon) : view === "archive" ? archiveMarkup(ws, query, icon) : '<div id="graph-host"></div>'}</div></main></div>`;
  bind();
  if (item && detailTab === "content")
    editor = new VisualEditor(
      $("#rich-editor"),
      item.kind === "knowledge"
        ? item.pendingChange || item.content
        : item.content,
      (content) => {
        if (item.kind === "knowledge") {
          item.pendingChange = content;
          item.freshness = "review";
          const state = $(".document-state");
          state.className = "document-state pending";
          state.innerHTML =
            icon("warning") +
            `<span>Revisión ${item.revision} · cambios sin publicar</span>`;
        } else item.content = content;
        changed(item);
      },
    );
  if (item && detailTab === "diagram") {
    void import("./diagram")
      .then(({ mountDiagram }) => {
        if (token !== renderToken) return;
        diagramCleanup = mountDiagram(
          $("#diagram-host"),
          item,
          () => changed(item),
          (e) => notify(String(e), true),
        );
      })
      .catch((e) => notify(String(e), true));
  }
  if (!item && view === "graph") {
    void import("./diagram")
      .then(({ mountGraph }) => {
        if (token !== renderToken) return;
        diagramCleanup = mountGraph($("#graph-host"), ws, openItem);
      })
      .catch((e) => notify(String(e), true));
  }
}
function validateDocuments(data: Workspace) {
  for (const item of data.items) {
    validContent(item.content);
    if (item.pendingChange) validContent(item.pendingChange);
    for (const revision of item.history) validContent(revision.content);
  }
  if (data.draft) validContent(data.draft.content);
}
function openItem(key: string) {
  selected = key;
  const item = itemBy(key);
  view =
    item.kind === "knowledge"
      ? "knowledge"
      : view === "archive"
        ? "archive"
        : "board";
  detailTab = "content";
  render();
}
function updateStatus(item: Item, status: Status) {
  safe(() => {
    setStatus(ws, item, status);
    changed();
    render();
  });
}
function bind() {
  $$<HTMLButtonElement>("[data-remove-link]").forEach(
    (b) =>
      (b.onclick = () => {
        ws.relations = ws.relations.filter(
          (r) => r.id !== b.dataset.removeLink,
        );
        changed();
        render();
      }),
  );
  $$<HTMLButtonElement>("[data-open]").forEach(
    (b) => (b.onclick = () => openItem(b.dataset.open!)),
  );
  $$<HTMLButtonElement>("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view as typeof view;
        selected = undefined;
        query = "";
        render();
      }),
  );
  $$<HTMLButtonElement>("[data-board]").forEach(
    (b) =>
      (b.onclick = () => {
        ws.settings.board = b.dataset.board as "status" | "epics";
        changed();
        render();
      }),
  );
  $$<HTMLButtonElement>("[data-new-kind]").forEach(
    (b) => (b.onclick = () => openComposer(b.dataset.newKind as Kind)),
  );
  $$<HTMLButtonElement>("[data-new-status]").forEach(
    (b) =>
      (b.onclick = () =>
        openComposer("story", undefined, b.dataset.newStatus as Status)),
  );
  $$<HTMLButtonElement>("[data-filter-epic]").forEach(
    (b) =>
      (b.onclick = () => {
        epicFilter = b.dataset.filterEpic!;
        selected = undefined;
        view = "board";
        render();
      }),
  );
  $("#epic-filter")?.addEventListener("change", (e) => {
    epicFilter = (e.target as HTMLSelectElement).value;
    render();
  });
  $("#search").addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    selected = undefined;
    render();
    const input = $<HTMLInputElement>("#search");
    input.focus();
    input.setSelectionRange(query.length, query.length);
  });
  const item = selected ? itemBy(selected) : undefined;
  if (item) {
    $<HTMLInputElement>("#item-title").oninput = (e) => {
      const title = (e.target as HTMLInputElement).value.trim();
      if (!title) {
        (e.target as HTMLInputElement).value = item.title;
        return;
      }
      item.title = title;
      changed(item);
    };
    $<HTMLInputElement>("#item-summary").oninput = (e) => {
      item.summary = (e.target as HTMLInputElement).value;
      changed(item);
    };
    $("#item-status")?.addEventListener("change", (e) => {
      const select = e.target as HTMLSelectElement;
      const previous = item.status;
      try {
        setStatus(ws, item, select.value as Status);
        changed();
        render();
      } catch (error) {
        select.value = previous;
        notify(String(error), true);
      }
    });
    $("#item-priority")?.addEventListener("change", (e) => {
      item.priority = (e.target as HTMLSelectElement).value as
        | "normal"
        | "high";
      changed();
    });
    $("#item-parent")?.addEventListener("change", (e) => {
      item.parentId = (e.target as HTMLSelectElement).value || undefined;
      changed();
      render();
    });
    $("#evidence")?.addEventListener("input", (e) => {
      const value = (e.target as HTMLTextAreaElement).value;
      if (item.kind === "knowledge") item.pendingEvidence = value;
      else item.evidence = value;
      changed();
    });
    $$<HTMLButtonElement>("[data-detail-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          detailTab = b.dataset.detailTab!;
          render();
        }),
    );
    $$<HTMLInputElement>("[data-check]").forEach(
      (input) =>
        (input.onchange = () => {
          const c = item.criteria.find((c) => c.id === input.dataset.check)!;
          c.checked = input.checked;
          changed();
          render();
        }),
    );
    $$<HTMLInputElement>("[data-criterion-text]").forEach(
      (input) =>
        (input.oninput = () => {
          item.criteria.find(
            (c) => c.id === input.dataset.criterionText,
          )!.text = input.value;
          changed();
        }),
    );
    $$<HTMLButtonElement>("[data-remove-criterion]").forEach(
      (b) =>
        (b.onclick = () => {
          item.criteria = item.criteria.filter(
            (c) => c.id !== b.dataset.removeCriterion,
          );
          changed();
          render();
        }),
    );
    $$<HTMLButtonElement>("[data-history]").forEach(
      (b) => (b.onclick = () => showHistory(item, Number(b.dataset.history))),
    );
  }
  $$<HTMLButtonElement>("[data-restore]").forEach(
    (b) =>
      (b.onclick = () => {
        itemBy(b.dataset.restore!).archived = false;
        changed();
        render();
      }),
  );
  $$("[data-drag]").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer!.setData("text/plain", card.dataset.drag!);
      e.dataTransfer!.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });
  $$("[data-drop]").forEach((column) => {
    column.addEventListener("dragover", (e) => {
      e.preventDefault();
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", (e) => {
      if (!column.contains(e.relatedTarget as Node))
        column.classList.remove("drag-over");
    });
    column.addEventListener("drop", (e) => {
      e.preventDefault();
      column.classList.remove("drag-over");
      const i = itemBy(e.dataTransfer!.getData("text/plain"));
      if (i) updateStatus(i, column.dataset.drop as Status);
    });
  });
  $$<HTMLButtonElement>("[data-action]").forEach(
    (b) => (b.onclick = () => safe(() => action(b.dataset.action!))),
  );
}
function closeModal() {
  modalEditor?.destroy();
  modalEditor = undefined;
  const dialog = document.querySelector<HTMLDialogElement>("#sheet");
  dialog?.close();
  document.getElementById("modal-root")!.innerHTML = "";
}
function modal(title: string, body: string, wide = false) {
  closeModal();
  document.getElementById("modal-root")!.innerHTML =
    `<dialog id="sheet" class="sheet ${wide ? "wide" : ""}"><header><h2>${title}</h2><button class="icon-button" id="close-sheet" aria-label="Cerrar">${icon("close")}</button></header><div class="sheet-body">${body}</div></dialog>`;
  const dialog = document.getElementById("sheet") as HTMLDialogElement;
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeModal();
    render();
  });
  dialog.querySelector("#close-sheet")!.addEventListener("click", () => {
    closeModal();
    render();
  });
  dialog.showModal();
  return dialog;
}
function openComposer(
  kind: Kind = "story",
  parentId?: string,
  status: Status = "todo",
) {
  if (!ws.draft)
    ws.draft = {
      kind,
      title: "",
      content: template(kind),
      criteria: [],
      parentId:
        parentId ||
        (kind === "story" && epicFilter !== "all" ? epicFilter : undefined),
    };
  const draft = ws.draft;
  const dialog = modal(
    "Nueva tarjeta",
    `<input id="draft-title" class="document-title" placeholder="Escribe un título…" aria-label="Título de la nueva tarjeta" value="${esc(draft.title)}"><div class="compose-properties"><label>Tipo<select id="draft-kind">${Object.entries(
      kindLabels,
    )
      .map(
        ([key, label]) =>
          `<option value="${key}" ${key === draft.kind ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Dentro de<select id="draft-parent"><option value="">Sin asignar</option>${options(
      ws.items.filter(
        (i) =>
          !i.archived &&
          (draft.kind === "story"
            ? i.kind === "epic"
            : draft.kind === "task"
              ? ["story", "task"].includes(i.kind)
              : false),
      ),
      draft.parentId,
    )}</select></label></div><div id="compose-editor"></div><section class="criteria"><h3>Criterios de aceptación</h3><div id="draft-criteria"></div><button class="text-button" id="new-draft-criterion">${icon("new")}Añadir criterio</button></section><div class="sheet-actions"><span class="muted">El borrador se conserva al cerrar.</span><button class="primary" id="create-item">Crear ${kindLabels[draft.kind].toLocaleLowerCase()}</button></div>`,
    true,
  );
  modalEditor = new VisualEditor(
    dialog.querySelector("#compose-editor")!,
    draft.content,
    (content) => {
      draft.content = content;
      changed();
    },
  );
  const renderCriteria = () => {
    dialog.querySelector("#draft-criteria")!.innerHTML = draft.criteria
      .map(
        (c) =>
          `<div class="criterion">${icon("circle")}<input data-draft-criterion="${c.id}" value="${esc(c.text)}" placeholder="Qué debe cumplirse…" aria-label="Criterio de aceptación"><button class="icon-button" data-remove="${c.id}" aria-label="Quitar criterio">${icon("close")}</button></div>`,
      )
      .join("");
    dialog.querySelectorAll<HTMLInputElement>("[data-draft-criterion]").forEach(
      (input) =>
        (input.oninput = () => {
          draft.criteria.find(
            (c) => c.id === input.dataset.draftCriterion,
          )!.text = input.value;
          changed();
        }),
    );
    dialog.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          draft.criteria = draft.criteria.filter(
            (c) => c.id !== b.dataset.remove,
          );
          changed();
          renderCriteria();
        }),
    );
  };
  renderCriteria();
  dialog.querySelector<HTMLInputElement>("#draft-title")!.oninput = (e) => {
    draft.title = (e.target as HTMLInputElement).value;
    changed();
  };
  dialog.querySelector<HTMLSelectElement>("#draft-kind")!.onchange = (e) => {
    draft.kind = (e.target as HTMLSelectElement).value as Kind;
    draft.parentId = undefined;
    const parentSelect =
      dialog.querySelector<HTMLSelectElement>("#draft-parent")!;
    parentSelect.innerHTML =
      '<option value="">Sin asignar</option>' +
      options(
        ws.items.filter(
          (i) =>
            !i.archived &&
            (draft.kind === "story"
              ? i.kind === "epic"
              : draft.kind === "task"
                ? ["story", "task"].includes(i.kind)
                : false),
        ),
      );
    dialog.querySelector("#create-item")!.textContent =
      "Crear " + kindLabels[draft.kind].toLocaleLowerCase();
    changed();
  };
  dialog.querySelector<HTMLSelectElement>("#draft-parent")!.onchange = (e) => {
    draft.parentId = (e.target as HTMLSelectElement).value || undefined;
    changed();
  };
  dialog.querySelector<HTMLButtonElement>("#new-draft-criterion")!.onclick =
    () => {
      draft.criteria.push({ id: id(), text: "", checked: false });
      renderCriteria();
      Array.from(
        dialog.querySelectorAll<HTMLInputElement>("[data-draft-criterion]"),
      )
        .at(-1)
        ?.focus();
      changed();
    };
  dialog.querySelector<HTMLButtonElement>("#create-item")!.onclick = () =>
    safe(() => {
      const item = createItem(
        ws,
        draft.kind,
        draft.title,
        draft.content,
        draft.parentId,
      );
      item.criteria = draft.criteria.filter((c) => c.text.trim());
      item.status = status === "done" ? "review" : status;
      ws.draft = undefined;
      changed();
      closeModal();
      openItem(item.id);
    });
  dialog.querySelector<HTMLInputElement>("#draft-title")!.focus();
}
function openLink(item: Item) {
  const targets = ws.items.filter((i) => i.id !== item.id && !i.archived);
  const dialog = modal(
    "Vincular una ficha",
    `<label class="field">Relación<select id="relation-type"><option value="references">Consulta</option><option value="modifies">Modifica documentación</option><option value="depends">Depende de</option></select></label><label class="field">Ficha<select id="relation-target">${options(targets)}</select></label><button id="save-relation" class="primary">Vincular</button>`,
  );
  dialog.querySelector<HTMLButtonElement>("#save-relation")!.onclick = () =>
    safe(() => {
      const type = dialog.querySelector<HTMLSelectElement>("#relation-type")!
        .value as "depends" | "modifies" | "references";
      const target =
        dialog.querySelector<HTMLSelectElement>("#relation-target")!.value;
      addRelation(ws, item.id, target, type);
      changed();
      closeModal();
      render();
    });
}
function showHistory(item: Item, index: number) {
  const revision = item.history[index];
  const dialog = modal(
    `Revisión ${revision.revision}`,
    `<p class="muted">${date(revision.at)}</p><div id="history-content"></div>${revision.evidence ? `<section class="evidence"><h3>Verificación de esta revisión</h3><p>${esc(revision.evidence)}</p></section>` : ""}<div class="sheet-actions"><button id="use-history">Usar como borrador</button></div>`,
    true,
  );
  modalEditor = new VisualEditor(
    dialog.querySelector("#history-content")!,
    revision.content,
    () => {},
    true,
  );
  dialog.querySelector<HTMLButtonElement>("#use-history")!.onclick = () => {
    item.pendingChange = structuredClone(revision.content);
    item.freshness = "review";
    changed();
    closeModal();
    detailTab = "content";
    render();
  };
}
function settings() {
  const s = ws.settings;
  const dialog = modal(
    "Configuración",
    `<section class="settings-section"><h3>${icon("palette")}Apariencia</h3><label class="setting-row">Tema<select id="setting-theme">${[
      ["system", "Automático"],
      ["light", "Claro"],
      ["dark", "Oscuro"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${s.theme === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="setting-row">Color de acento<input id="setting-accent" type="color" value="${esc(s.accent)}" aria-label="Color de acento"></label><div class="swatches">${["#007aff", "#8e5bd9", "#dc4966", "#cc721c", "#398576", "#555968"].map((color) => `<button data-color="${color}" style="--swatch:${color}" aria-label="Usar color ${color}"></button>`).join("")}</div><label class="setting-row">Fuente<select id="setting-font">${[
      ["system", "Sistema · San Francisco"],
      ["rounded", "Sistema redondeada"],
      ["serif", "Sistema serif"],
      ["mono", "Monoespaciada"],
      ["Helvetica Neue", "Helvetica Neue"],
      ["Avenir Next", "Avenir Next"],
      ["Georgia", "Georgia"],
      ["Menlo", "Menlo"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${s.font === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="setting-row">Tamaño del texto <span><input type="range" id="setting-size" min="11" max="18" value="${s.fontSize}" aria-label="Tamaño del texto"><output id="size-value">${s.fontSize} px</output></span></label><label class="setting-row">Densidad<select id="setting-density"><option value="comfortable">Cómoda</option><option value="compact" ${s.density === "compact" ? "selected" : ""}>Compacta</option></select></label><div class="appearance-preview"><strong>Una idea que se convierte en trabajo</strong><p>Texto, criterios y contexto que permanecen.</p><span class="accent-badge">Tu color de acento</span></div></section><section class="settings-section"><h3>Espacio local</h3><label class="setting-row">Nombre<input id="space-name" value="${esc(ws.name)}" aria-label="Nombre del espacio"></label><p class="storage-path">${esc(storage.dataFolder)}</p><div class="setting-actions"><button id="export-space">${icon("export")}Exportar</button><button id="import-space">${icon("import")}Importar</button><button id="context-path">${icon("copy")}Copiar ruta</button></div><p class="muted">Tus datos permanecen en este Mac. Exporta una copia para respaldarlos o moverlos a otro equipo.</p></section><div class="sheet-actions"><button id="reset-appearance">Restablecer apariencia</button><button class="primary" id="done-settings">Listo</button></div>`,
  );
  const update = () => {
    applyAppearance();
    changed();
  };
  dialog.querySelector<HTMLSelectElement>("#setting-theme")!.onchange = (e) => {
    s.theme = (e.target as HTMLSelectElement).value as typeof s.theme;
    update();
  };
  dialog.querySelector<HTMLInputElement>("#setting-accent")!.oninput = (e) => {
    s.accent = (e.target as HTMLInputElement).value;
    update();
  };
  dialog.querySelectorAll<HTMLButtonElement>("[data-color]").forEach(
    (b) =>
      (b.onclick = () => {
        s.accent = b.dataset.color!;
        dialog.querySelector<HTMLInputElement>("#setting-accent")!.value =
          s.accent;
        update();
      }),
  );
  dialog.querySelector<HTMLSelectElement>("#setting-font")!.onchange = (e) => {
    s.font = (e.target as HTMLSelectElement).value;
    update();
  };
  dialog.querySelector<HTMLInputElement>("#setting-size")!.oninput = (e) => {
    s.fontSize = Number((e.target as HTMLInputElement).value);
    dialog.querySelector("#size-value")!.textContent = s.fontSize + " px";
    update();
  };
  dialog.querySelector<HTMLSelectElement>("#setting-density")!.onchange = (
    e,
  ) => {
    s.density = (e.target as HTMLSelectElement).value as typeof s.density;
    update();
  };
  dialog.querySelector<HTMLInputElement>("#space-name")!.oninput = (e) => {
    ws.name = (e.target as HTMLInputElement).value || "Mi espacio";
    changed();
  };
  dialog.querySelector<HTMLButtonElement>("#export-space")!.onclick = () =>
    safe(storage.exportSpace);
  dialog.querySelector<HTMLButtonElement>("#import-space")!.onclick = () =>
    safe(importSpace);
  dialog.querySelector<HTMLButtonElement>("#context-path")!.onclick = () =>
    safe(async () => {
      await navigator.clipboard.writeText(storage.dataFolder);
      notify("Ruta copiada");
    });
  dialog.querySelector<HTMLButtonElement>("#reset-appearance")!.onclick =
    () => {
      Object.assign(ws.settings, defaultSettings);
      update();
      closeModal();
      render();
      settings();
    };
  dialog.querySelector<HTMLButtonElement>("#done-settings")!.onclick = () => {
    closeModal();
    render();
  };
}
async function importSpace() {
  const data = await storage.chooseImport();
  if (!data) return;
  validateDocuments(data);
  const dialog = modal(
    "Importar espacio",
    `<p>Se abrirá <strong>${esc(data.name)}</strong> con ${data.items.length} fichas. Primero se exportará una copia del espacio actual.</p><div class="sheet-actions"><button id="confirm-import" class="primary">Exportar copia e importar</button></div>`,
  );
  dialog.querySelector<HTMLButtonElement>("#confirm-import")!.onclick = () =>
    safe(async () => {
      if (!(await storage.exportSpace())) return;
      storage.replace(data);
      ws = storage.current();
      await storage.flush();
      closeModal();
      selected = undefined;
      render();
      notify("Espacio importado");
    });
}
function newDelivery() {
  const eligible = ws.items.filter(
    (i) => !i.archived && i.kind !== "knowledge" && i.status === "done",
  );
  const dialog = modal(
    "Registrar entrega",
    `<label class="field">Nombre<input id="delivery-title" placeholder="v0.1 · Primera entrega"></label><label class="field">Notas<textarea id="delivery-notes" placeholder="Qué cambió para quien lo recibe…"></textarea></label><h3>Trabajo terminado</h3>${eligible.map((i) => `<label class="check-row"><input type="checkbox" data-delivery-item="${i.id}" checked>${esc(i.title)}</label>`).join("") || '<p class="muted">Termina y verifica alguna historia antes de registrar una entrega.</p>'}<div class="sheet-actions"><button class="primary" id="save-delivery" ${eligible.length ? "" : "disabled"}>Registrar</button></div>`,
  );
  dialog.querySelector<HTMLButtonElement>("#save-delivery")!.onclick = () =>
    safe(() => {
      const title = dialog
        .querySelector<HTMLInputElement>("#delivery-title")!
        .value.trim();
      if (!title) throw new Error("Escribe un nombre para la entrega.");
      const items = [
        ...dialog.querySelectorAll<HTMLInputElement>(
          "[data-delivery-item]:checked",
        ),
      ].map((i) => itemBy(i.dataset.deliveryItem!));
      if (!items.length) throw new Error("Selecciona el trabajo entregado.");
      for (const item of items) {
        const issues = completionIssues(ws, item);
        if (issues.length)
          throw new Error(item.title + ": " + issues.join(" "));
      }
      const docIds = new Set(
        ws.relations
          .filter(
            (r) =>
              items.some((i) => i.id === r.source) && r.type === "modifies",
          )
          .map((r) => r.target),
      );
      ws.deliveries.unshift({
        id: id(),
        title,
        at: new Date().toISOString(),
        items: items.map((i) => i.id),
        documents: [...docIds].map((id) => ({
          id,
          revision: itemBy(id).revision,
        })),
        notes:
          dialog.querySelector<HTMLTextAreaElement>("#delivery-notes")!.value,
      });
      changed();
      closeModal();
      render();
    });
}
async function action(name: string) {
  const item = selected ? itemBy(selected) : undefined;
  switch (name) {
    case "recover-storage":
      if (await storage.exportSpace()) location.reload();
      break;
    case "new":
      openComposer(view === "knowledge" ? "knowledge" : "story");
      break;
    case "settings":
      settings();
      break;
    case "toggle-sidebar":
      ws.settings.sidebar = !ws.settings.sidebar;
      applyAppearance();
      changed();
      break;
    case "dismiss-welcome":
      ws.exampleDismissed = true;
      changed();
      render();
      break;
    case "back":
      selected = undefined;
      render();
      break;
    case "add-criterion":
      if (item) {
        item.criteria.push({ id: id(), text: "", checked: false });
        changed();
        render();
        const inputs = $$<HTMLInputElement>("[data-criterion-text]");
        inputs.at(-1)?.focus();
      }
      break;
    case "new-subtask":
      if (item) openComposer(item.kind === "epic" ? "story" : "task", item.id);
      break;
    case "new-knowledge":
      openComposer("knowledge");
      break;
    case "link":
      if (item) openLink(item);
      break;
    case "verify-doc":
      if (item) {
        reviseKnowledge(
          item,
          item.pendingChange || item.content,
          item.pendingEvidence ?? item.evidence,
        );
        changed();
        render();
        notify(`Revisión ${item.revision} publicada`);
      }
      break;
    case "archive":
      if (item) {
        [item, ...descendants(ws, item.id)].forEach((i) => (i.archived = true));
        changed();
        selected = undefined;
        render();
        notify("Archivado. Puedes restaurarlo desde Archivo.");
      }
      break;
    case "copy-context":
      if (item) {
        await navigator.clipboard.writeText(exportItem(ws, item));
        notify("Contexto copiado");
      }
      break;
    case "export-item":
      if (item)
        await storage.exportText(
          item.title.replace(/[^\p{L}\p{N} -]/gu, "") + ".md",
          exportItem(ws, item),
        );
      break;
    case "new-delivery":
      newDelivery();
      break;
  }
}
async function boot() {
  document.documentElement.classList.toggle("native", storage.native);
  storage.reportStorage((state, error) => {
    saveLabel = state;
    saveError = error;
    const label = document.getElementById("save-label");
    if (label) label.textContent = state;
    const recovery = document.getElementById("recover-storage");
    if (recovery) recovery.style.display = error ? "block" : "none";
    if (error) notify(error, true);
  });
  try {
    ws = await storage.load();
    validateDocuments(ws);
    render();
    if (ws.revision === 0) {
      changed();
      await storage.flush();
    }
  } catch (error) {
    app.innerHTML = `<div class="startup-error"><h1>No se pudo abrir el espacio</h1><p>${esc(error)}</p><p>El archivo original se ha conservado.</p><button id="retry">Intentar de nuevo</button></div>`;
    document.getElementById("retry")!.onclick = () => location.reload();
    return;
  }
  matchMedia("(prefers-color-scheme:dark)").addEventListener(
    "change",
    applyAppearance,
  );
  document.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      openComposer();
    } else if (key === ",") {
      event.preventDefault();
      settings();
    } else if (key === "f") {
      event.preventDefault();
      $("#search").focus();
    } else if (key === "s") {
      event.preventDefault();
      safe(storage.flush);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden")
      void storage.flush().catch(() => {});
  });
  if (storage.native) {
    let checkingExternal = false;
    const canRefresh = () => document.visibilityState === "visible" &&
      !document.querySelector("dialog[open]") &&
      !(document.activeElement instanceof HTMLElement && document.activeElement.matches("input, textarea, select, [contenteditable=true]"));
    const refreshExternal = async () => {
      if (checkingExternal || !canRefresh()) return;
      checkingExternal = true;
      try {
        if (await storage.refreshExternal(canRefresh, validateDocuments)) {
          ws = storage.current();
          if (selected && !ws.items.some(item => item.id === selected)) selected = undefined;
          render();
          notify("Se recibieron cambios externos del espacio.");
        }
      } catch (error) { notify(String(error), true); }
      finally { checkingExternal = false; }
    };
    window.addEventListener("focus", () => void refreshExternal());
    setInterval(() => void refreshExternal(), 2000);
    const { listen } = await import("@tauri-apps/api/event");
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await listen<string>("app-menu", (event) => {
      safe(async () => {
        switch (event.payload) {
          case "zoom-in":
          case "zoom-out":
          case "zoom-reset":
            zoomActiveSurface(event.payload);
            break;
          case "new":
            openComposer();
            break;
          case "settings":
            settings();
            break;
          case "search":
            $("#search").focus();
            break;
          case "export":
            await storage.exportSpace();
            break;
          case "import":
            await importSpace();
            break;
          case "sidebar":
            await action("toggle-sidebar");
            break;
        }
      });
    });
    await listen("app-quit", () =>
      safe(async () => {
        await storage.flush();
        await invoke("exit_app");
      }),
    );
    await getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        await storage.flush();
        await getCurrentWindow().destroy();
      } catch {
        notify("No se cerró la ventana porque hay cambios sin guardar.", true);
      }
    });
  }
}
void boot();
