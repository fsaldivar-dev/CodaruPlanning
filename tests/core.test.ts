import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspace,
  createItem,
  addRelation,
  setStatus,
  completionIssues,
  reviseKnowledge,
  validateWorkspace,
  rich,
  paragraph,
  exportItem,
  contextRecords,
} from "../packages/planning-core/src/index.ts";
import { validContent } from "../src/schema.ts";

test("a story cannot close until children, criteria, evidence and affected docs are verified", () => {
  const ws = initialWorkspace(),
    story = ws.items.find((i) => i.kind === "story")!,
    child = ws.items.find((i) => i.kind === "task")!,
    doc = ws.items.find((i) => i.kind === "knowledge")!;
  assert.equal(completionIssues(ws, story).length, 4);
  assert.throws(() => setStatus(ws, story, "done"), /criterios/);
  child.evidence = "Reviewed the acceptance checklist";
  setStatus(ws, child, "done");
  story.criteria.forEach((c) => (c.checked = true));
  story.evidence = "Confirmed against v1";
  assert.throws(() => setStatus(ws, story, "done"), /documentación/);
  reviseKnowledge(
    doc,
    rich(paragraph("Verified behavior")),
    "Compared with v1",
  );
  setStatus(ws, story, "done");
  assert.equal(story.status, "done");
  setStatus(ws, story, "doing");
  assert.equal(doc.freshness, "review");
});

test("dependencies reject cycles and actually block completion", () => {
  const ws = initialWorkspace(),
    a = createItem(ws, "task", "A"),
    b = createItem(ws, "task", "B"),
    c = createItem(ws, "task", "C");
  addRelation(ws, a.id, b.id, "depends");
  addRelation(ws, b.id, c.id, "depends");
  assert.throws(() => addRelation(ws, c.id, a.id, "depends"), /ciclo/);
  assert.throws(() => addRelation(ws, a.id, a.id, "depends"), /consigo/);
  a.evidence = "checked";
  assert.throws(() => setStatus(ws, a, "done"), /dependencias/);
  c.evidence = "checked";
  setStatus(ws, c, "done");
  b.evidence = "checked";
  setStatus(ws, b, "done");
  setStatus(ws, a, "done");
  validateWorkspace(ws);
});

test("published knowledge keeps its previous content and pending drafts are not exported as truth", () => {
  const ws = initialWorkspace(),
    doc = ws.items.find((i) => i.kind === "knowledge")!,
    previous = structuredClone(doc.content);
  doc.pendingChange = rich(paragraph("Unverified draft"));
  assert.doesNotMatch(exportItem(ws, doc), /Unverified draft/);
  assert.throws(
    () => reviseKnowledge(doc, doc.pendingChange!, ""),
    /revisaste/,
  );
  reviseKnowledge(doc, doc.pendingChange, "QA complete");
  assert.deepEqual(doc.history[0].content, previous);
  assert.equal(doc.revision, 2);
  assert.equal(doc.pendingChange, undefined);
  assert.match(exportItem(ws, doc), /Unverified draft/);
  assert.ok(contextRecords(ws).find((i) => i.id === doc.id)?.relations.length);
});

test("malformed imports fail before replacing the current workspace", () => {
  const original = initialWorkspace();
  validateWorkspace(original);
  for (const mutate of [
    (w: any) => delete w.items[0].summary,
    (w: any) => w.items.push(w.items[0]),
    (w: any) => (w.settings.fontSize = "huge"),
    (w: any) => (w.items[0].parentId = w.items[1].id),
    (w: any) => w.deliveries.push({}),
  ]) {
    const imported = structuredClone(original);
    mutate(imported);
    assert.throws(() => validateWorkspace(imported));
  }
  assert.equal(original.items.length, 5);
});

test("visual document format accepts valid rich text and rejects invalid nesting", () => {
  const formatted = rich({
    type: "paragraph",
    content: [{ type: "text", text: "Rich text", marks: [{ type: "strong" }] }],
  });
  assert.deepEqual(validContent(formatted).toJSON(), formatted);
  assert.throws(() =>
    validContent({
      type: "doc",
      content: [{ type: "text", text: "invalid at document root" }],
    }),
  );
});

test("draft verification stays separate from published evidence and its history", () => {
  const ws = initialWorkspace();
  const doc = ws.items.find(i => i.kind === "knowledge")!;
  reviseKnowledge(doc, rich(paragraph("Version one")), "Verified against v1");
  doc.pendingEvidence = "Verification for pending v2";
  doc.pendingChange = rich(paragraph("Version two"));
  assert.match(exportItem(ws, doc), /Verified against v1/);
  assert.doesNotMatch(exportItem(ws, doc), /pending v2/);
  reviseKnowledge(doc, doc.pendingChange, doc.pendingEvidence);
  assert.equal(doc.history[0].evidence, "Verified against v1");
  assert.equal(doc.evidence, "Verification for pending v2");
  assert.equal(doc.pendingEvidence, undefined);
});
