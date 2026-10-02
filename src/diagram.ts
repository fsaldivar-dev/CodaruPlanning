import {
  createDiagram,
  createDocument,
  darkTheme,
  lightTheme,
  type DiagramDocument,
  type DiagramEditor,
  type NodeType,
} from "@fsaldivar.dev/diagram";
import { wrapNodeLabels } from "@fsaldivar.dev/diagram/labels";
import { saveDocument, loadDocument } from "@fsaldivar.dev/plugin";
import { bindNavigation } from "./navigation";
import { native } from "./storage";
import { icon, esc } from "./icons";
import { kindLabels, type Item, type Workspace } from "@codaru/planning-core";
import "@fsaldivar.dev/diagram/style.css";

export function mountDiagram(
  host: HTMLElement,
  item: Item,
  onChange: () => void,
  onError: (e: unknown) => void,
): () => void {
  host.innerHTML = `<div class="diagram-tools"><button data-node="process">${icon("new")}Paso</button><button data-node="decision">Decisión</button><button data-tool="select">Seleccionar</button><button data-tool="connect">Conectar</button><button data-undo aria-label="Deshacer en el diagrama">${icon("undo")}</button><button data-fit>Ajustar</button><button data-save class="primary">Guardar diagrama</button></div><div class="diagram-canvas"></div><p class="muted">Dos dedos para desplazar · pellizca o usa ⌘ +/− para zoom · ⌘0 restablece. Doble clic para editar texto.</p>`;
  let alive = true;
  const theme =
    getComputedStyle(document.documentElement).colorScheme === "dark"
      ? darkTheme
      : lightTheme;
  const editor = createDiagram(host.querySelector(".diagram-canvas")!, {
    document:
      (item.diagram as DiagramDocument) ||
      createDocument({
        nodes: [
          { id: "start", type: "start", title: "Inicio" },
          { id: "step", type: "process", title: "Mi proceso" },
        ],
        edges: [{ id: "first", source: "start", target: "step" }],
      }),
    theme,
    autoFit: true,
    onNodeRender: wrapNodeLabels,
    onChange: (doc) => {
      item.diagram = doc;
      onChange();
    },
  });
  const cleanupNavigation = diagramNavigation(host, editor);
  host
    .querySelectorAll<HTMLElement>("[data-node]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          editor.addNode(
            b.dataset.node as NodeType,
            b.dataset.node === "decision" ? "¿Condición?" : "Nuevo paso",
          )),
    );
  host
    .querySelectorAll<HTMLElement>("[data-tool]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          editor.setTool(b.dataset.tool as "select" | "connect")),
    );
  host.querySelector<HTMLElement>("[data-undo]")!.onclick = () => editor.undo();
  host.querySelector<HTMLElement>("[data-fit]")!.onclick = () => editor.fit();
  host.querySelector<HTMLElement>("[data-save]")!.onclick = () => {
    item.diagram = editor.getDocument();
    onChange();
    if (native)
      saveDocument(item.id, editor.getDocument())
        .then(() => {
          if (alive)
            host.querySelector("[data-save]")!.textContent = "Guardado";
        })
        .catch(onError);
    else host.querySelector("[data-save]")!.textContent = "Guardado";
  };
  if (native && !item.diagram) {
    void loadDocument(item.id)
      .then((doc) => {
        if (alive && doc && !item.diagram) editor.setDocument(doc);
      })
      .catch(onError);
  }
  return () => {
    alive = false;
    cleanupNavigation();
    editor.destroy();
  };
}
export function mountGraph(
  host: HTMLElement,
  ws: Workspace,
  open: (id: string) => void,
): () => void {
  const items = ws.items.filter((i) => !i.archived);
  let selected: string | undefined;
  host.innerHTML = `<div class="diagram-tools"><span class="muted">${items.length} fichas · jerarquía y relaciones</span><button data-fit>Ajustar</button><button data-open disabled>Abrir ficha</button></div><div class="diagram-canvas graph-canvas"></div><div class="graph-caption muted">Dos dedos para desplazar · pellizca o usa ⌘ +/− para zoom · ⌘0 restablece. Selecciona un nodo para abrir su ficha.</div>`;
  const doc = createDocument({
    nodes: items.map((i) => ({
      id: i.id,
      type: (i.kind === "knowledge"
        ? "file"
        : i.kind === "epic"
          ? "module"
          : "generic") as NodeType,
      title: i.title,
    })),
    edges: [
      ...ws.relations
        .filter(
          (r) =>
            items.some((i) => i.id === r.source) &&
            items.some((i) => i.id === r.target),
        )
        .map((r) => ({
          id: r.id,
          source: r.source,
          target: r.target,
          label:
            r.type === "depends"
              ? "depende de"
              : r.type === "modifies"
                ? "modifica"
                : "consulta",
        })),
      ...items
        .filter((i) => i.parentId && items.some((p) => p.id === i.parentId))
        .map((i) => ({
          id: `parent-${i.id}`,
          source: i.parentId!,
          target: i.id,
          label: "contiene",
        })),
    ],
  });
  const editor = createDiagram(host.querySelector(".diagram-canvas")!, {
    document: doc,
    readOnly: true,
    autoFit: true,
    theme:
      getComputedStyle(document.documentElement).colorScheme === "dark"
        ? darkTheme
        : lightTheme,
    onNodeRender: (node, layer, layout) => {
      wrapNodeLabels(node, layer, layout);
      const label = layer.querySelector(".cd-type");
      const item = items.find((i) => i.id === node.id);
      if (label && item) label.textContent = kindLabels[item.kind];
    },
    onSelectionChange: (selection) => {
      selected = selection?.kind === "node" ? selection.id : undefined;
      const button = host.querySelector<HTMLButtonElement>("[data-open]")!;
      button.disabled = !selected;
      host.querySelector(".graph-caption")!.textContent = selected
        ? items.find((i) => i.id === selected)!.title
        : "Selecciona un nodo.";
    },
  });
  host.querySelector<HTMLElement>("[data-fit]")!.onclick = () => editor.fit();
  host.querySelector<HTMLElement>("[data-open]")!.onclick = () => {
    if (selected) open(selected);
  };
  const cleanupNavigation = diagramNavigation(host, editor);
  return () => {
    cleanupNavigation();
    editor.destroy();
  };
}

function diagramNavigation(host: HTMLElement, editor: DiagramEditor) {
  const canvas = host.querySelector<HTMLElement>(".diagram-canvas")!;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Lienzo del diagrama");
  return bindNavigation(canvas, {
    min: 0.15,
    max: 4,
    getZoom: () => editor.getViewport().zoom,
    setZoom: (zoom, center) => {
      const rect = canvas.getBoundingClientRect();
      editor.zoomBy(
        zoom / editor.getViewport().zoom,
        center
          ? { x: center.x - rect.left, y: center.y - rect.top }
          : undefined,
      );
    },
    pan: (x, y) => {
      const viewport = editor.getViewport();
      editor.setViewport({ ...viewport, x: viewport.x - x, y: viewport.y - y });
    },
  });
}
