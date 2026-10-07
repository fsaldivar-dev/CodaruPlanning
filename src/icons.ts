const map: Record<string, string> = {
  board: "rectangle.split.3x1",
  epic: "square.stack.3d.up",
  knowledge: "book.closed",
  deliveries: "shippingbox",
  graph: "point.3.connected.trianglepath.dotted",
  settings: "gearshape",
  new: "plus",
  close: "xmark",
  search: "magnifyingglass",
  right: "chevron.right",
  down: "chevron.down",
  back: "arrow.left",
  open: "arrow.up.right",
  check: "checkmark",
  verified: "checkmark.circle",
  circle: "circle",
  idea: "lightbulb",
  story: "bookmark",
  task: "checklist",
  link: "link",
  document: "doc.text",
  newdoc: "doc.badge.plus",
  edit: "pencil",
  bold: "bold",
  italic: "italic",
  bullet: "list.bullet",
  ordered: "list.number",
  quote: "text.quote",
  undo: "arrow.uturn.backward",
  redo: "arrow.uturn.forward",
  export: "square.and.arrow.up",
  import: "square.and.arrow.down",
  more: "ellipsis",
  archive: "archivebox",
  warning: "exclamationmark.triangle",
  refresh: "arrow.triangle.2.circlepath",
  filter: "line.3.horizontal.decrease",
  copy: "square.on.square",
  palette: "paintpalette",
  font: "textformat",
  light: "sun.max",
  dark: "moon",
  system: "desktopcomputer",
  delete: "trash",
  sidebar: "sidebar.left",
  design: "paintpalette",
};
export function icon(name: string) {
  return `<span class="symbol" aria-hidden="true" style="--symbol:url('/symbols/${map[name] || map.document}.png')"></span>`;
}
export const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
