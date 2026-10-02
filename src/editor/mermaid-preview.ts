import { createDiagram, darkTheme, lightTheme, type DiagramEditor } from "@fsaldivar.dev/diagram";
import { wrapNodeLabels } from "@fsaldivar.dev/diagram/labels";
import { bindNavigation } from "../navigation";
import { parseMermaidPreview } from "./mermaid-parser";
import "@fsaldivar.dev/diagram/style.css";

export function mountMermaidPreview(canvas: HTMLElement) {
  let editor: DiagramEditor | undefined;
  const theme = () => ({
    ...(getComputedStyle(document.documentElement).colorScheme === "dark" ? darkTheme : lightTheme),
    fontFamily: getComputedStyle(canvas).fontFamily,
  });
  const cleanupNavigation = bindNavigation(canvas, {
    min: 0.1,
    max: 4,
    getZoom: () => editor?.getViewport().zoom || 1,
    setZoom: (zoom, center) => {
      if (!editor) return;
      const rect = canvas.getBoundingClientRect();
      editor.zoomBy(zoom / editor.getViewport().zoom, center ? {
        x: (center.x - rect.left) * canvas.clientWidth / rect.width,
        y: (center.y - rect.top) * canvas.clientHeight / rect.height,
      } : undefined);
    },
  });
  // Kairo normally pans on wheel. Inline diagrams must let the document scroll.
  const scrollDocument = (event: WheelEvent) => {
    if (!event.metaKey && !event.ctrlKey) event.stopImmediatePropagation();
  };
  canvas.addEventListener("wheel", scrollDocument, { capture: true, passive: true });
  const appearance = new MutationObserver(() => editor?.setTheme(theme()));
  appearance.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-theme"] });
  return {
    render(source: string, layout?: unknown) {
      // Remove stale output before parsing: an invalid draft must not show an old graph.
      editor?.destroy();
      editor = undefined;
      const { document, notice } = parseMermaidPreview(source, layout);
      const boxes = Object.values(document.layout.nodes);
      const width = Math.max(...boxes.map(box => box.x + box.width)) - Math.min(...boxes.map(box => box.x));
      const height = Math.max(...boxes.map(box => box.y + box.height)) - Math.min(...boxes.map(box => box.y));
      const scale = Math.min(1, Math.max(1, canvas.clientWidth - 56) / Math.max(1, width));
      canvas.style.height = `${Math.max(240, Math.min(440, height * scale + 56))}px`;
      editor = createDiagram(canvas, {
        document, theme: theme(), readOnly: true, autoFit: true,
        onNodeRender: wrapNodeLabels,
      });
      editor.setTool("pan");
      editor.fit(28);
      return notice;
    },
    fit() { editor?.fit(28); },
    destroy() {
      cleanupNavigation();
      canvas.removeEventListener("wheel", scrollDocument, { capture: true });
      appearance.disconnect();
      editor?.destroy();
    },
  };
}
