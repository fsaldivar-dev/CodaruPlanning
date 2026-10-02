import { createDiagram, lightTheme, darkTheme, type DiagramEditor, type NodeShape, type NodeType, type Tool } from "@fsaldivar.dev/diagram";
import { wrapNodeLabels } from "@fsaldivar.dev/diagram/labels";
import { parseMermaidPreview } from "./mermaid-parser";
import { visualMermaidEdit, type MermaidEdit } from "./mermaid-editing";
import { bindNavigation } from "../navigation";
import "./mermaid-designer.css";

/** Edits a detached draft. Applying is the only operation that changes the document. */
export function openMermaidDesigner(source: string, layout: unknown, apply: (edit: MermaidEdit) => void) {
  const initial = parseMermaidPreview(source, layout).document;
  const dialog = document.createElement("dialog");
  dialog.className = "mermaid-designer";
  dialog.setAttribute("aria-label", "Editar diagrama en Kairo");
  dialog.innerHTML = `<header><div><strong>Editar diagrama</strong><span>Kairo · Mermaid</span></div><button type="button" data-cancel aria-label="Cerrar editor de diagrama">Cerrar</button></header>
    <div class="designer-toolbar" role="toolbar" aria-label="Herramientas del diagrama">
      <button type="button" data-tool="select" aria-pressed="true">Seleccionar</button>
      <button type="button" data-tool="connect" aria-pressed="false">Conectar</button>
      <button type="button" data-tool="pan" aria-pressed="false">Mover lienzo</button>
      <span class="designer-separator"></span>
      <button type="button" data-add="process">+ Paso</button>
      <button type="button" data-add="decision">+ Decisión</button>
      <button type="button" data-add="start">+ Inicio / fin</button>
      <button type="button" data-undo disabled>Deshacer</button>
      <button type="button" data-redo disabled>Rehacer</button>
      <button type="button" data-fit>Ajustar</button>
    </div>
    <div class="designer-workspace"><div class="designer-canvas" tabindex="0" aria-label="Lienzo editable de Kairo"></div>
      <aside class="designer-inspector"><strong>Selección</strong>
        <p data-selection-hint>Selecciona una figura o conexión para editarla.</p>
        <label data-label-field hidden>Texto<input aria-label="Texto de la selección" autocomplete="off"></label>
        <label data-shape-field hidden>Forma<select aria-label="Forma del nodo"><option value="rectangle">Rectángulo</option><option value="diamond">Decisión</option><option value="pill">Inicio / fin</option><option value="ellipse">Elipse</option><option value="cylinder">Base de datos</option><option value="hexagon">Hexágono</option><option value="subprocess">Subproceso</option><option value="parallelogram">Entrada / salida</option><option value="trapezoid">Trapecio</option></select></label>
        <div class="designer-selection-actions"><button type="button" data-duplicate disabled>Duplicar</button><button type="button" data-remove disabled>Eliminar</button></div>
        <hr><strong>Nueva conexión</strong>
        <label>Desde<select aria-label="Nodo de origen" data-from></select></label>
        <label>Hacia<select aria-label="Nodo de destino" data-to></select></label>
        <button type="button" data-link>Crear conexión</button>
        <p class="designer-help">Doble clic para editar texto. Arrastra figuras para colocarlas. Dos dedos desplazan; ⌘ +/− o pellizco hacen zoom.</p>
      </aside></div>
    <div class="designer-result"><p data-notice hidden></p><p data-error role="alert" hidden></p>
      <details><summary>Mermaid que se guardará</summary><pre data-source></pre></details></div>
    <footer><span data-count></span><button type="button" data-cancel>Cancelar</button><button type="button" class="primary" data-apply disabled>Aplicar cambios</button></footer>`;
  const get = <T extends HTMLElement = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const canvas = get(".designer-canvas");
  const input = get<HTMLInputElement>("[data-label-field] input");
  const shape = get<HTMLSelectElement>("[data-shape-field] select");
  const from = get<HTMLSelectElement>("[data-from]");
  const to = get<HTMLSelectElement>("[data-to]");
  const applyButton = get<HTMLButtonElement>("[data-apply]");
  const error = get("[data-error]");
  let editor: DiagramEditor | undefined;
  let cleanupNavigation = () => {};
  let alive = true;
  let pending: MermaidEdit | undefined;
  const initialJSON = JSON.stringify(initial);
  const previousFocus = document.activeElement as HTMLElement | null;
  const close = () => {
    if (!alive) return;
    alive = false;
    cleanupNavigation();
    editor?.destroy();
    dialog.close();
    dialog.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  const showError = (problem: unknown) => {
    error.hidden = false;
    error.textContent = problem instanceof Error ? problem.message : "No se pudo aplicar el diagrama.";
  };
  const updateInspector = () => {
    if (!editor) return;
    const doc = editor.getDocument(), selection = editor.getSelection();
    const node = selection?.kind === "node" ? doc.graph.nodes.find(n => n.id === selection.id) : undefined;
    const edge = selection?.kind === "edge" ? doc.graph.edges.find(e => e.id === selection.id) : undefined;
    get("[data-selection-hint]").hidden = !!(node || edge);
    get("[data-label-field]").hidden = !(node || edge);
    get("[data-shape-field]").hidden = !node;
    if (document.activeElement !== input) input.value = node?.title || edge?.label || "";
    if (node) shape.value = doc.layout.nodes[node.id].shape || (node.type === "decision" ? "diamond" : node.type === "start" || node.type === "end" ? "pill" : "rectangle");
    get<HTMLButtonElement>("[data-duplicate]").disabled = !node;
    get<HTMLButtonElement>("[data-remove]").disabled = !(node || edge);
    for (const select of [from, to]) {
      const previous = select.value;
      select.replaceChildren(...doc.graph.nodes.map(n => new Option(n.title || n.id, n.id)));
      if (doc.graph.nodes.some(n => n.id === previous)) select.value = previous;
      else if (select === to && doc.graph.nodes.length > 1) select.selectedIndex = 1;
    }
    get<HTMLButtonElement>("[data-link]").disabled = doc.graph.nodes.length < 2;
  };
  const update = () => {
    if (!editor) return;
    const doc = editor.getDocument();
    error.hidden = true;
    pending = undefined;
    try {
      pending = visualMermaidEdit(source, initial, doc);
      get("[data-source]").textContent = pending.source;
      const notice = get("[data-notice]");
      notice.hidden = !pending.converts;
      notice.textContent = "Al aplicar, este bloque se convertirá en un flujo Mermaid con las figuras y conexiones del lienzo. La notación avanzada, estilos y directivas que Kairo no representa se sustituirán. Puedes cancelar para conservar la fuente original.";
      applyButton.textContent = pending.converts ? "Aplicar como flujo Mermaid" : "Aplicar cambios";
      applyButton.disabled = JSON.stringify(doc) === initialJSON;
    } catch (problem) { applyButton.disabled = true; showError(problem); }
    get("[data-count]").textContent = `${doc.graph.nodes.length} figuras · ${doc.graph.edges.length} conexiones`;
    updateInspector();
  };
  dialog.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach(b => b.onclick = close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  // Keep app-level shortcuts from replacing the parent document while this draft is open.
  dialog.addEventListener("keydown", event => event.stopPropagation());
  applyButton.onclick = () => {
    if (!pending || applyButton.disabled) return;
    try { apply(pending); close(); } catch (problem) { showError(problem); }
  };
  document.body.append(dialog);
  dialog.showModal();
  try {
    editor = createDiagram(canvas, {
      document: structuredClone(initial), autoFit: true,
      theme: { ...(getComputedStyle(document.documentElement).colorScheme === "dark" ? darkTheme : lightTheme),
        fontFamily: getComputedStyle(dialog).fontFamily },
      onNodeRender: wrapNodeLabels,
      onChange: update,
      onSelectionChange: updateInspector,
      onHistoryChange: state => {
        get<HTMLButtonElement>("[data-undo]").disabled = !state.canUndo;
        get<HTMLButtonElement>("[data-redo]").disabled = !state.canRedo;
      },
    });
    const diagram = editor;
    cleanupNavigation = bindNavigation(canvas, {
      min: 0.1, max: 4,
      getZoom: () => diagram.getViewport().zoom,
      setZoom: (zoom, center) => {
        const rect = canvas.getBoundingClientRect();
        diagram.zoomBy(zoom / diagram.getViewport().zoom, center ? { x: center.x - rect.left, y: center.y - rect.top } : undefined);
      },
      pan: (x, y) => { const v = diagram.getViewport(); diagram.setViewport({ ...v, x: v.x - x, y: v.y - y }); },
    });
    const setTool = (tool: Tool) => {
      diagram.setTool(tool);
      dialog.querySelectorAll<HTMLButtonElement>("button[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    };
    dialog.querySelectorAll<HTMLButtonElement>("button[data-tool]").forEach(b => b.onclick = () => { setTool(b.dataset.tool as Tool); canvas.focus(); });
    dialog.querySelectorAll<HTMLButtonElement>("[data-add]").forEach(b => b.onclick = () => {
      const type = b.dataset.add as NodeType;
      setTool("select");
      const doc = diagram.getDocument();
      const boxes = Object.values(doc.layout.nodes);
      // Place new figures outside existing boxes, instead of covering the center node.
      const x = boxes.length ? Math.max(...boxes.map(box => box.x + box.width)) + 64 : 80;
      const y = boxes.length ? Math.min(...boxes.map(box => box.y)) : 80;
      diagram.addNode(type, type === "decision" ? "¿Condición?" : type === "start" ? "Inicio" : "Nuevo paso", { x, y });
      diagram.fit(32);
      canvas.focus();
    });
    input.oninput = () => {
      const selection = diagram.getSelection();
      if (selection?.kind === "node") diagram.updateNode(selection.id, { title: input.value });
      else if (selection?.kind === "edge") diagram.updateEdge(selection.id, { label: input.value });
    };
    shape.onchange = () => {
      const selection = diagram.getSelection();
      if (selection?.kind === "node") diagram.updateNodeLayout(selection.id, { shape: shape.value as NodeShape });
    };
    get("[data-duplicate]").onclick = () => diagram.duplicateSelected();
    get("[data-remove]").onclick = () => diagram.removeSelected();
    get("[data-undo]").onclick = () => diagram.undo();
    get("[data-redo]").onclick = () => diagram.redo();
    get("[data-fit]").onclick = () => diagram.fit(32);
    get("[data-link]").onclick = () => {
      if (!diagram.connect(from.value, to.value)) showError("Esa conexión ya existe o no está permitida.");
    };
    update();
    diagram.fit(32);
    canvas.focus();
  } catch (problem) { close(); throw problem; }
  return close;
}
