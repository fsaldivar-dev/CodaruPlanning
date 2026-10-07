import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
let dom: JSDOM;
let doc: typeof import("@fsaldivar.dev/planning/document");
let editorModule: typeof import("@fsaldivar.dev/planning/editor");
before(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const win = dom.window;
  for (const key of ["window", "document", "navigator", "Node", "Element", "HTMLElement", "HTMLInputElement", "MutationObserver", "getComputedStyle", "DOMParser", "Range", "Option", "Event", "matchMedia", "AbortController"]) {
    const value = key === "matchMedia" ? (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) : key === "AbortController" ? AbortController : (win as any)[key];
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  win.Range.prototype.getClientRects = () => [] as any;
  win.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 10, top: 0, bottom: 10, width: 10, height: 10, x: 0, y: 0, toJSON() {} });
  doc = await import("@fsaldivar.dev/planning/document");
  editorModule = await import("@fsaldivar.dev/planning/editor");
});
after(() => dom.window.close());
const host = () => { const element = document.createElement("div"); document.body.append(element); return element; };
const settle = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const source = "# Conocimiento\n\nVer [ADR](adr/0001.md) y [mal](https://x.test).\n\n- [x] hecho\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```mermaid\nflowchart LR\n  A[Idea] --> B[Entrega]\n```\n\n```codaru-mockup\nscreen: s-login\n```\n\n```swift\nlet x = 1\n```\n";

test("mountDocument renders Markdown read-only, with Mermaid and no editing controls", async () => {
  const container = host();
  const view = doc.mountDocument(container, { markdown: source });
  const root = view.element;
  assert.ok(root.classList.contains("planning-document"));
  assert.equal(root.querySelector<HTMLElement>(".ProseMirror")!.getAttribute("contenteditable"), "false");
  for (const selector of [".block-toolbar", ".table-tools", ".block-footer", ".block-gutter"]) assert.ok([...root.querySelectorAll<HTMLElement>(selector)].every(e => e.hidden), selector);
  assert.ok(root.querySelector("table"));
  assert.equal(root.querySelector<HTMLInputElement>("[data-task-item] input")!.disabled, true);
  const mermaid = root.querySelector<HTMLElement>(".mermaid-block")!;
  assert.ok(mermaid, "Mermaid block is rendered by the Kairo view");
  assert.equal([...mermaid.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Editar en Kairo")!.hidden, true);
  const code = root.querySelector<HTMLElement>('.code-block[data-language="swift"]')!;
  assert.equal(code.querySelector("select")!.hidden, true);
  assert.equal(code.querySelector(".code-language")!.textContent, "Swift");
  // Without an enhancer an unknown fence is plain code: its text is never lost.
  assert.match(root.textContent!, /screen: s-login/);
  await settle(80);
  assert.notEqual(mermaid.dataset.preview, "loading");
  view.destroy(); container.remove();
});

test("a BlockEnhancer paints its fence, gets the context and falls back to text with a note on failure", async () => {
  const container = host();
  const opened: unknown[] = [];
  let ctxSeen: any;
  const mockup: import("@fsaldivar.dev/planning/document").BlockEnhancer = {
    language: "codaru-mockup", label: "Pantallas",
    async render(code, ctx) {
      ctxSeen = ctx;
      const file = await ctx.load("Mockups.codarumockup");
      const element = document.createElement("figure");
      element.className = "my-mockup";
      element.textContent = `${code.trim()} · ${file}`;
      element.onclick = () => ctx.onOpen({ screen: "s-login" });
      return element;
    },
  };
  const view = doc.mountDocument(container, { markdown: source, enhancers: [mockup], theme: "dark",
    load: async (file, language) => `${language}:${file}`, onOpen: (target, language) => opened.push([language, target]) });
  await settle();
  const block = view.element.querySelector<HTMLElement>('.enhanced-block[data-language="codaru-mockup"]')!;
  assert.equal(block.dataset.preview, "ready");
  assert.equal(block.querySelector(".enhanced-label")!.textContent, "Pantallas");
  assert.equal(block.querySelector(".my-mockup")!.textContent, "screen: s-login · codaru-mockup:Mockups.codarumockup");
  assert.equal(block.querySelector<HTMLElement>(".enhanced-source")!.hidden, true);
  assert.equal(ctxSeen.language, "codaru-mockup"); assert.equal(ctxSeen.readOnly, true);
  block.querySelector<HTMLElement>(".my-mockup")!.click();
  assert.deepEqual(opened, [["codaru-mockup", { screen: "s-login" }]]);
  // Other blocks are untouched by the enhancer.
  assert.ok(view.element.querySelector(".mermaid-block"));

  const broken = doc.mountDocument(container, { markdown: "Antes\n\n```codaru-mockup\npantalla rota\n```\n\nDespués", enhancers: [{ language: "codaru-mockup", render() { throw new Error("archivo no encontrado"); } }] });
  await settle();
  const failed = broken.element.querySelector<HTMLElement>(".enhanced-block")!;
  assert.equal(failed.dataset.preview, "error");
  assert.match(failed.querySelector(".enhanced-status")!.textContent!, /archivo no encontrado.*texto original/);
  assert.equal(failed.querySelector<HTMLElement>(".enhanced-source")!.hidden, false);
  assert.match(failed.querySelector(".enhanced-source")!.textContent!, /pantalla rota/);
  assert.match(broken.element.textContent!, /Antes[\s\S]*Después/);

  const noLoad = doc.mountDocument(container, { markdown: "```codaru-mockup\nx\n```", enhancers: [mockup] });
  await settle();
  assert.match(noLoad.element.querySelector(".enhanced-status")!.textContent!, /load/);
  for (const v of [view, broken, noLoad]) v.destroy();
  container.remove();
});

test("themes accept light/dark and live tokens; links go to the host and unsafe content is refused", async () => {
  const container = host();
  const links: string[] = [];
  let renders = 0;
  const view = doc.mountDocument(container, { markdown: source, theme: { accent: "var(--codaru-accent)", "--planning-surface": "#101010", bad: "red; background: url(x)" },
    onOpenLink: href => links.push(href), enhancers: [{ language: "codaru-mockup", render: () => { renders++; return document.createElement("div"); } }] });
  await settle();
  const root = view.element;
  assert.equal(root.style.getPropertyValue("--planning-accent"), "var(--codaru-accent)");
  assert.equal(root.style.getPropertyValue("--planning-surface"), "#101010");
  assert.equal(root.style.getPropertyValue("--planning-bad"), "");
  const before = renders;
  view.update({ theme: "dark" });
  assert.equal(root.dataset.theme, "dark");
  assert.equal(root.style.getPropertyValue("--planning-accent"), "");
  await settle();
  assert.ok(renders > before, "enhanced blocks re-render when the theme changes");
  [...root.querySelectorAll("a")].find(a => a.textContent === "ADR")!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.deepEqual(links, ["adr/0001.md"]);
  view.update({ markdown: "## Otro documento" });
  assert.equal(root.querySelector("h2")!.textContent, "Otro documento");
  assert.throws(() => doc.mountDocument(container, { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] } }), /enlaces/i);
  assert.throws(() => doc.mountDocument(container, { markdown: "<script>alert(1)</script>" }), /no compatible/);
  view.destroy(); container.remove();
});

test("the block editor accepts the same enhancers and keeps the source editable", async () => {
  const container = host();
  const editor = editorModule.createBlockEditor(container, { markdown: "```codaru-mockup\nscreen: a\n```", enhancers: [{ language: "codaru-mockup", render: code => { const e = document.createElement("div"); e.className = "mine"; e.textContent = code; return e; } }] });
  await settle();
  const block = container.querySelector<HTMLElement>(".enhanced-block")!;
  assert.equal(block.querySelector(".mine")!.textContent, "screen: a");
  block.querySelector<HTMLButtonElement>(".enhanced-header button")!.click();
  assert.equal(block.querySelector<HTMLElement>(".enhanced-source")!.hidden, false);
  assert.match(editor.getMarkdown(), /```codaru-mockup\nscreen: a\n```/);
  editor.destroy(); container.remove();
});
