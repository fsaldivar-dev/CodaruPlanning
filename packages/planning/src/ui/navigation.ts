type Point = { x: number; y: number };
type Navigation = {
  getZoom: () => number;
  setZoom: (zoom: number, center?: Point) => void;
  pan?: (x: number, y: number) => void;
  min?: number;
  max?: number;
};
type ZoomAction = "zoom-in" | "zoom-out" | "zoom-reset";
const surfaces = new Set<{
  host: HTMLElement;
  change: (action: ZoomAction) => void;
}>();
export function zoomActiveSurface(action: ZoomAction) {
  const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
  const visible = [...surfaces].filter(
    (surface) =>
      surface.host.isConnected &&
      surface.host.getClientRects().length &&
      (!dialog || dialog.contains(surface.host)),
  );
  const target =
    visible.filter((surface) => surface.host.contains(document.activeElement))
      .find(surface => !visible.some(other => other !== surface &&
        surface.host.contains(other.host) && other.host.contains(document.activeElement))) ||
    visible.find(surface => !visible.some(other => other !== surface && other.host.contains(surface.host)));
  target?.change(action);
}
export const zoomFromWheel = (zoom: number, delta: number) =>
  zoom * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.006);

/** Plain two-finger scrolling is never interpreted as zoom. WebKit emits
 * gesture events for pinch; Chromium emits a wheel event with ctrlKey. */
export function bindNavigation(host: HTMLElement, navigation: Navigation) {
  const { getZoom, setZoom, pan, min = 0.6, max = 2 } = navigation;
  let gestureStartZoom: number | undefined;
  const apply = (zoom: number, center?: Point) =>
    setZoom(Math.max(min, Math.min(max, zoom)), center);
  const surface = {
    host,
    change: (action: ZoomAction) =>
      apply(
        action === "zoom-reset"
          ? 1
          : getZoom() * (action === "zoom-out" ? 1 / 1.1 : 1.1),
      ),
  };
  surfaces.add(surface);
  host.setAttribute?.("data-navigation-surface", "");
  const ownsEvent = (event: Event) => {
    const closest = (event.target as Element | null)?.closest?.("[data-navigation-surface]");
    return !closest || closest === host;
  };
  const center = (event: MouseEvent) => ({
    x: event.clientX,
    y: event.clientY,
  });
  const wheel = (event: WheelEvent) => {
    if (!ownsEvent(event)) return;
    const multiplier =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? host.clientHeight
          : 1;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (gestureStartZoom === undefined)
        apply(
          zoomFromWheel(getZoom(), event.deltaY * multiplier),
          center(event),
        );
    } else if (pan) {
      event.preventDefault();
      event.stopImmediatePropagation();
      pan(event.deltaX * multiplier, event.deltaY * multiplier);
    }
    // Documents retain the browser's native scroll chain, including momentum.
  };
  const gesture = (event: Event) => {
    if (!ownsEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = event as Event & {
      scale: number;
      clientX: number;
      clientY: number;
    };
    if (event.type === "gesturestart") gestureStartZoom = getZoom();
    else if (
      event.type === "gesturechange" &&
      gestureStartZoom !== undefined &&
      Number.isFinite(input.scale)
    )
      apply(gestureStartZoom * input.scale, {
        x: input.clientX,
        y: input.clientY,
      });
    else if (event.type === "gestureend") gestureStartZoom = undefined;
  };
  const keyboard = (event: KeyboardEvent) => {
    if (!ownsEvent(event)) return;
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing)
      return;
    const key = ["+", "=", "-", "0"].includes(event.key)
      ? event.key
      : (
          {
            Equal: "+",
            Minus: "-",
            Digit0: "0",
            NumpadAdd: "+",
            NumpadSubtract: "-",
          } as Record<string, string>
        )[event.code];
    if (!key) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    apply(key === "0" ? 1 : getZoom() * (key === "-" ? 1 / 1.1 : 1.1));
  };
  host.addEventListener("wheel", wheel, { capture: true, passive: false });
  host.addEventListener("keydown", keyboard, true);
  for (const name of ["gesturestart", "gesturechange", "gestureend"])
    host.addEventListener(name, gesture, { capture: true, passive: false });
  return () => {
    surfaces.delete(surface);
    host.removeAttribute?.("data-navigation-surface");
    host.removeEventListener("wheel", wheel, { capture: true });
    host.removeEventListener("keydown", keyboard, { capture: true });
    for (const name of ["gesturestart", "gesturechange", "gestureend"])
      host.removeEventListener(name, gesture, { capture: true });
  };
}
