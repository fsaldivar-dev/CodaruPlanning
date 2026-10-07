import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { applyOperations, emptyWorkspace, validateWorkspace, neighbors, markAffected, impact, baselineFor, baselineFingerprint, cardSignals, verificationProposals, agentSnapshot, workspaceDiff, contextRecords, exportItem, type Workspace, type Operation } from "@fsaldivar.dev/planning";
let dom: JSDOM;
let components: typeof import("@fsaldivar.dev/planning/components");
before(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  for (const key of ["window", "document", "Node", "Element", "HTMLElement"]) Object.defineProperty(globalThis, key, { configurable: true, value: (dom.window as any)[key] });
  components = await import("@fsaldivar.dev/planning/components");
});
after(() => dom.window.close());
const apply = (ws: Workspace, operations: Operation[], actor?: string) => applyOperations(ws, { expectedRevision: ws.revision, operations, ...(actor ? { actor } : {}) });
const bump = (ws: Workspace) => ({ ...ws, revision: ws.revision + 1 });
/*
 * login (card) ← implements ← code_login ── uses ──→ code_api ── uses ──→ tok_accent
 *                                                      ↑ implements
 *                                                    api (card)
 * scr_login ── covers ──→ login        scr_api ── covers ──→ api
 */
function graph() {
  const first = apply(emptyWorkspace("Codaru"), [
    { op: "create", ref: "login", kind: "story", title: "Acceso", paths: ["src/auth/**"] },
    { op: "create", ref: "api", kind: "story", title: "API de sesión" },
    { op: "create", ref: "doc", kind: "knowledge", title: "Autenticación" },
    { op: "node", id: "scr_login", kind: "screen", ref: { file: "Mockups.codarumockup", screen: "s-login" }, label: "Inicio de sesión", approvedHash: "d1" },
    { op: "node", id: "scr_api", kind: "screen", ref: { file: "Mockups.codarumockup", screen: "s-api" }, approvedHash: "a1" },
    { op: "node", id: "code_login", kind: "code", ref: "src/auth/login.ts", hash: "c1" },
    { op: "node", id: "code_api", kind: "code", ref: "src/auth/api.ts", hash: "p1" },
    { op: "node", id: "tok_accent", kind: "token", ref: "--codaru-accent", hash: "t1" },
    { op: "link", source: "scr_login", target: "@login", type: "covers" },
    { op: "link", source: "scr_api", target: "@api", type: "covers" },
    { op: "link", source: "code_login", target: "@login", type: "implements" },
    { op: "link", source: "code_api", target: "@api", type: "implements" },
    { op: "link", source: "code_login", target: "code_api", type: "uses" },
    { op: "link", source: "code_api", target: "tok_accent", type: "uses" },
    { op: "link", source: "@login", target: "@doc", type: "modifies" },
  ], "FranPlanner");
  return { ws: bump(first.workspace), refs: first.refs };
}

test("nodes and the new edges validate; ownership is unique; older workspaces still validate", () => {
  const { ws, refs } = graph();
  validateWorkspace(ws);
  const legacy = emptyWorkspace();
  validateWorkspace(legacy); assert.equal(legacy.nodes, undefined);
  const fail = (operations: Operation[], pattern: RegExp) => assert.throws(() => apply(ws, operations), pattern);
  fail([{ op: "link", source: "code_login", target: refs.api, type: "implements" }], /ya tiene dueña/);
  fail([{ op: "link", source: "scr_login", target: refs.doc, type: "covers" }], /pantalla con una tarjeta/);
  fail([{ op: "link", source: "tok_accent", target: "code_api", type: "uses" }], /código con código o con un token/);
  fail([{ op: "link", source: "code_api", target: "scr_api", type: "uses" }], /código con código o con un token/);
  fail([{ op: "node", id: "tok", kind: "token", ref: "x", approvedHash: "h" }], /approvedHash solo existe en pantallas/);
  fail([{ op: "node", id: "scr", kind: "screen", ref: { file: "http://x", screen: "s" } }], /ruta relativa/);
  fail([{ op: "node", id: refs.login, kind: "code", ref: "a.ts" }], /id de una ficha/);
  fail([{ op: "update", id: refs.login, patch: { paths: ["data:x"] } }], /rutas relativas/);
  fail([{ op: "update", id: refs.login, patch: { builtAgainst: ["x"] as any } }], /builtAgainst/);
  // Removing a node drops its relations; nothing else changes.
  const removed = apply(ws, [{ op: "unnode", id: "code_api" }]).workspace;
  assert.equal(removed.relations.some(r => r.source === "code_api" || r.target === "code_api"), false);
  assert.equal(removed.items.length, ws.items.length);
  const stored = JSON.parse(JSON.stringify(ws)); stored.relations.push({ id: "r_bad", source: "code_api", target: refs.login, type: "implements" });
  assert.throws(() => validateWorkspace(stored), /relaciones inválidas/);
});

test("neighbors, context and export include screens, code and tokens", () => {
  const { ws, refs } = graph();
  const around = neighbors(ws, refs.login);
  assert.deepEqual(around.filter(n => n.node).map(n => [n.relation, n.direction, n.node!.id]).sort(), [["covers", "in", "scr_login"], ["implements", "in", "code_login"]]);
  assert.deepEqual(neighbors(ws, "code_api").map(n => n.item?.id ?? n.node?.id).sort(), [refs.api, "code_login", "tok_accent"].sort());
  assert.ok(contextRecords(ws).find(r => r.id === refs.login)!.relations.some(r => r.id === "scr_login" && r.node === "screen" && r.title === "Inicio de sesión"));
  assert.match(exportItem(ws, ws.items.find(i => i.id === refs.login)!), /Territorio: src\/auth\/\*\*[\s\S]*covers: screen Inicio de sesión \(scr_login\)/);
});

test("impact: the API radius stops at the first owner, the token radius reaches screens as a light signal", () => {
  const { ws, refs } = graph();
  const by = (list: ReturnType<typeof impact>) => Object.fromEntries(list.map(i => [i.id, i.severity]));
  // The owner's own file is its changeset; the card using it through `uses` is affected.
  assert.deepEqual(by(impact(ws, "code_api")), { [refs.api]: "changeset", [refs.login]: "affected" });
  assert.deepEqual(impact(ws, "code_api").find(i => i.id === refs.login)!.via, ["code_api", "code_login"]);
  assert.deepEqual(by(impact(ws, "code_login")), { [refs.login]: "changeset" });
  assert.deepEqual(by(impact(ws, "tok_accent")), { [refs.api]: "affected", [refs.login]: "affected", scr_api: "visual", scr_login: "visual" });
  assert.deepEqual(by(impact(ws, "scr_login")), { [refs.login]: "affected" });
  // markAffected: pure from a node, unchanged behavior from an item.
  const before = JSON.stringify(ws);
  assert.deepEqual(markAffected(ws, "tok_accent"), impact(ws, "tok_accent"));
  assert.equal(JSON.stringify(ws), before);
  const copy = structuredClone(ws);
  const doc = copy.items.find(i => i.id === refs.doc)!; doc.freshness = "current";
  assert.deepEqual(markAffected(copy, refs.login).map(i => [i.id, i.severity]), [[refs.doc, "docs"]]);
  assert.equal(doc.freshness, "review");
});

test("signals are derived from the baseline and turn off by themselves; done + affected proposes verification", () => {
  let { ws, refs } = graph();
  assert.deepEqual(baselineFor(ws, refs.login), { code_api: "p1", scr_login: "d1", tok_accent: "t1" });
  assert.deepEqual(cardSignals(ws, refs.login), [], "no baseline, no signal");
  ws = bump(apply(ws, [
    { op: "update", id: refs.login, patch: { builtAgainst: baselineFor(ws, refs.login), owns: ["src/auth/login.ts"], evidence: "probado" } },
    { op: "update", id: refs.api, patch: { builtAgainst: baselineFingerprint(baselineFor(ws, refs.api)), evidence: "probado" } },
    { op: "publish", id: refs.doc, evidence: "revisado contra el código" },
    { op: "status", id: refs.login, status: "done" }, { op: "status", id: refs.api, status: "done" },
  ]).workspace);
  assert.deepEqual(cardSignals(ws, refs.login), []);
  assert.deepEqual(cardSignals(ws, refs.api), []);
  // The design of login is re-approved with a new hash: login drifts, api does not.
  ws = bump(apply(ws, [{ op: "node", id: "scr_login", kind: "screen", ref: { file: "Mockups.codarumockup", screen: "s-login" }, label: "Inicio de sesión", approvedHash: "d2" }], "persona").workspace);
  assert.deepEqual(cardSignals(ws, refs.login), [{ node: "scr_login", kind: "screen", reason: "design", built: "d1", current: "d2" }]);
  assert.deepEqual(cardSignals(ws, refs.api), []);
  const login = ws.items.find(i => i.id === refs.login)!;
  assert.equal(login.status, "done", "never reopened");
  assert.deepEqual(login.activity!.at(-1), { ...login.activity!.at(-1), op: "approval", actor: "persona", note: "scr_login", from: "d1", to: "d2" });
  assert.deepEqual(verificationProposals(ws).map(p => p.id), [refs.login]);
  assert.deepEqual(verificationProposals(ws, id => id === refs.login), [], "covered by a test: no proposal");
  assert.deepEqual(agentSnapshot(ws).items.find(i => i.id === refs.login)!.stale, ["design"]);
  // A shared token changes: both cards drift; the string baseline only knows "something changed".
  ws = bump(apply(ws, [{ op: "node", id: "tok_accent", kind: "token", ref: "--codaru-accent", hash: "t2" }]).workspace);
  assert.deepEqual(cardSignals(ws, refs.login).map(s => s.reason).sort(), ["dependency", "design"]);
  assert.deepEqual(cardSignals(ws, refs.api).map(s => s.reason), ["baseline"]);
  // Reverting both to the same hashes turns every signal off, with nothing to clean up.
  ws = bump(apply(ws, [
    { op: "node", id: "tok_accent", kind: "token", ref: "--codaru-accent", hash: "t1" },
    { op: "node", id: "scr_login", kind: "screen", ref: { file: "Mockups.codarumockup", screen: "s-login" }, label: "Inicio de sesión", approvedHash: "d1" },
  ]).workspace);
  assert.deepEqual([cardSignals(ws, refs.login), cardSignals(ws, refs.api), verificationProposals(ws)], [[], [], []]);
  // null means "no baseline": no signal even when the design moves.
  ws = bump(apply(ws, [{ op: "status", id: refs.login, status: "review" }, { op: "update", id: refs.login, patch: { builtAgainst: null } }, { op: "node", id: "scr_login", kind: "screen", ref: { file: "Mockups.codarumockup", screen: "s-login" }, approvedHash: "d9" }]).workspace);
  assert.deepEqual(cardSignals(ws, refs.login), []);
});

test("snapshot and diff carry nodes; the UI shows node relations and the derived badge", () => {
  let { ws, refs } = graph();
  const snapshot = agentSnapshot(ws);
  assert.deepEqual(snapshot.nodes!.find(n => n[0] === "scr_login"), ["scr_login", "screen", true]);
  assert.ok(snapshot.relations.some(r => r[0] === "code_login" && r[1] === "implements" && r[2] === refs.login));
  const next = apply(ws, [
    { op: "node", id: "scr_login", kind: "screen", ref: { file: "Mockups.codarumockup", screen: "s-login" }, approvedHash: "d2" },
    { op: "node", id: "code_new", kind: "code", ref: "src/new.ts" }, { op: "unnode", id: "tok_accent" },
    { op: "update", id: refs.login, patch: { builtAgainst: baselineFor(ws, refs.login) } },
  ]).workspace;
  const diff = workspaceDiff(ws, next);
  assert.deepEqual(diff.nodes, { created: ["code_new"], removed: ["tok_accent"], updated: [{ id: "scr_login", fields: ["approvedHash"] }] });
  assert.deepEqual(diff.updated.find(u => u.id === refs.login)!.fields, ["builtAgainst"]);
  const host = document.createElement("div"); document.body.append(host);
  const item = next.items.find(i => i.id === refs.login)!;
  const props = components.mountProperties(host, { workspace: next, item, onUnlink: () => {} });
  assert.equal(props.element.querySelector(".drift-badge")!.textContent!.trim(), "Diseño cambió");
  const nodeRows = [...props.element.querySelectorAll<HTMLElement>(".relation-node")].map(e => e.dataset.node).sort();
  assert.deepEqual(nodeRows, ["code_login", "scr_login"]);
  assert.match(components.cardMarkup(next, item), /drift-badge/);
  assert.doesNotMatch(components.cardMarkup(ws, ws.items.find(i => i.id === refs.login)!), /drift-badge/);
  props.destroy(); host.remove();
});
