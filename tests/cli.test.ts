import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { applyOperations, emptyWorkspace, type Batch } from "../packages/planning/src/operations.ts";
import { fromMarkdown, validateDocuments } from "../packages/planning/src/documents.ts";
import { initializeWorkspace, applyToFile, readWorkspace, withWorkspaceLock } from "../packages/planning/src/files.ts";
import { markdown, plain, createItem, setStatus, rich } from "../packages/planning-core/src/index.ts";
const run = promisify(execFile);
const cli = resolve("packages/planning/dist/cli.js");

test("Markdown input preserves Mermaid and produces editor-compatible rich blocks", () => {
  const source = '# Resultado\n\n**Listo** y [guía](https://example.com).\n\n- [x] Verificado\n- [ ] Pendiente\n\n| Campo | Valor |\n| --- | --- |\n| Estado | Activo |\n\n> Nota\n\n```mermaid\nflowchart LR\n  A[Idea] --> B[Entrega]\n```\n';
  const doc = fromMarkdown(source);
  assert.equal(doc.content?.at(-1)?.attrs?.language, "mermaid");
  assert.equal(plain(doc.content!.at(-1)!), 'flowchart LR\n  A[Idea] --> B[Entrega]');
  const output = markdown(doc);
  assert.match(output, /\*\*Listo\*\*/); assert.match(output, /- \[x\] Verificado/); assert.match(output, /\| Campo \| Valor \|/);
  assert.match(output, /```mermaid\nflowchart LR/);
  assert.throws(() => fromMarkdown('<script>alert(1)</script>'), /compatible/);
  assert.throws(() => fromMarkdown('[bad](javascript:alert(1))'), /Enlace/);
  assert.match(markdown(fromMarkdown('| A |\n|---|\n| uno<br>dos |')), /uno<br>dos/);
});

test("one transaction creates hierarchy, verifies criteria, publishes knowledge and records delivery", () => {
  const original = emptyWorkspace("Entrega");
  const result = applyOperations(original, { expectedRevision: 0, operations: [
    { op: "create", kind: "epic", title: "v1", ref: "epic" },
    { op: "create", kind: "story", title: "Acceso", ref: "story", parentId: "@epic", criteria: [{ text: "Permite entrar", checked: false }] },
    { op: "create", kind: "task", title: "Validar acceso", parentId: "@story", ref: "task" },
    { op: "create", kind: "knowledge", title: "Cómo acceder", ref: "doc", markdown: "## Qué hace\nAcceso seguro" },
    { op: "link", source: "@story", target: "@doc", type: "modifies" },
    { op: "update", id: "@task", patch: { evidence: "Prueba de entrada correcta" } },
    { op: "status", id: "@task", status: "done" },
    { op: "draft", id: "@doc", markdown: "## Qué hace\nVersión revisada" },
    { op: "publish", id: "@doc", evidence: "Comparado con v1", source: "@story" },
    { op: "update", id: "@story", patch: { evidence: "QA correcto", criteria: [{ text: "Permite entrar", checked: true }] } },
    // Updating work invalidates its docs, so publishing must follow the last edit.
    { op: "publish", id: "@doc", evidence: "Confirmado después del último cambio" },
    { op: "status", id: "@story", status: "done" },
    { op: "deliver", title: "v1", items: ["@story"], notes: "Acceso verificado" },
  ] });
  assert.equal(original.items.length, 0);
  const { workspace: ws, refs } = result;
  assert.equal(ws.items.find(i => i.id === refs.story)?.status, "done");
  assert.equal(ws.items.find(i => i.id === refs.doc)?.history.length, 2);
  assert.equal(ws.deliveries[0].documents[0].revision, 3);
  validateDocuments(ws);
});

test("invalid dependencies, stale revision, unknown fields and incomplete work roll back entirely", () => {
  const ws = emptyWorkspace();
  for (const batch of [
    { expectedRevision: 1, operations: [{ op: "rename", name: "Stale" }] },
    { expectedRevision: 0, operations: [{ op: "create", kind: "story", title: "A", ref: "a" }, { op: "status", id: "@a", status: "done" }] },
    { expectedRevision: 0, operations: [{ op: "create", kind: "task", title: "A", ref: "a" }, { op: "create", kind: "task", title: "B", ref: "b" }, { op: "link", source: "@a", target: "@b", type: "depends" }, { op: "link", source: "@b", target: "@a", type: "depends" }] },
    { expectedRevision: 0, operations: [{ op: "create", kind: "task", title: "Typo", summry: "Missing letter" }] },
  ]) {
    assert.throws(() => applyOperations(ws, batch as Batch));
    assert.equal(ws.items.length, 0); assert.equal(ws.name, "Mi espacio");
  }
  const parent = createItem(ws, "story", "Parent"); parent.evidence = "Tested"; setStatus(ws, parent, "done");
  assert.throws(() => applyOperations(ws, { expectedRevision: 0, operations: [{ op: "create", kind: "task", title: "New work", parentId: parent.id }] }), /Reabre/);
});

test("knowledge drafts remain unpublished and direct updates cannot bypass version history", () => {
  const ws = emptyWorkspace(); const doc = createItem(ws, "knowledge", "Documento", fromMarkdown("Actual"));
  assert.throws(() => applyOperations(ws, { expectedRevision: 0, operations: [{ op: "update", id: doc.id, patch: { markdown: "Bypass" } }] }), /draft y publish/);
  const result = applyOperations(ws, { expectedRevision: 0, operations: [{ op: "draft", id: doc.id, markdown: "Pendiente" }] });
  assert.equal(plain(result.workspace.items[0].content), "Actual");
  assert.equal(plain(result.workspace.items[0].pendingChange!), "Pendiente");
});

test("file apply has real dry-run, backups, cache and optimistic concurrency between CLI processes", async () => {
  const folder = await mkdtemp(join(tmpdir(), "planning-cli-")); const path = join(folder, "workspace.json");
  try {
    await initializeWorkspace(path, "Prueba");
    await assert.rejects(initializeWorkspace(path, "Overwrite"), /ya existe/);
    const batch: Batch = { expectedRevision: 1, operations: [{ op: "create", kind: "knowledge", title: "Diagrama", ref: "doc", markdown: "## Flujo\n```mermaid\nflowchart LR\n A --> B\n```" }] };
    const previous = await readFile(path, "utf8");
    await applyToFile(path, batch, true); assert.equal(await readFile(path, "utf8"), previous);
    const processes = ["A", "B"].map(name => new Promise<{ code: number | null; stdout: string; stderr: string }>(resolve => {
      const child = spawn(process.execPath, [cli, "apply", "--workspace", path, "--file", "-"], { stdio: "pipe" });
      let stdout = "", stderr = ""; child.stdout.on("data", data => stdout += data); child.stderr.on("data", data => stderr += data);
      child.on("exit", code => resolve({ code, stdout, stderr }));
      child.stdin.end(JSON.stringify({ ...batch, operations: [{ ...batch.operations[0], title: name }] }));
    }));
    const results = await Promise.all(processes);
    assert.equal(results.filter(r => r.code === 0).length, 1);
    assert.match(results.find(r => r.code !== 0)!.stderr, /Conflicto de revisión/);
    const ws = await readWorkspace(path); assert.equal(ws.revision, 2); assert.equal(ws.items.length, 1);
    assert.equal(await readFile(join(folder, "workspace.previous.json"), "utf8"), previous);
    assert.match(await readFile(join(folder, "context", `${ws.items[0].id}.md`), "utf8"), /```mermaid/);
    assert.equal(JSON.parse(await readFile(join(folder, "context/index.json"), "utf8")).workspaceRevision, 2);
    const result = JSON.parse((await run(process.execPath, [cli, "read", ws.items[0].id, "Flujo", "--workspace", path])).stdout);
    assert.equal(result.workspaceRevision, 2); assert.match(result.markdown, /flowchart LR/);
    await mkdir(`${path}.write-lock`);
    await assert.rejects(withWorkspaceLock(path, async () => undefined, 10), /ocupado/);
    await rmdir(`${path}.write-lock`);
    assert.equal((await readWorkspace(path)).revision, 2);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("CLI help/schema work outside repo and invalid commands and implicit writes fail", async () => {
  const schema = JSON.parse((await run(process.execPath, [cli, "schema"], { cwd: tmpdir() })).stdout);
  assert.ok(schema.properties.operations.items.oneOf.length >= 10);
  assert.throws(() => execFileSync(process.execPath, [cli, "apply", "--file", "-"], { input: "{}", stdio: "pipe" }), /workspace/);
  assert.throws(() => execFileSync(process.execPath, [cli, "destroy-everything"], { stdio: "pipe" }), /Comando desconocido/);
});
