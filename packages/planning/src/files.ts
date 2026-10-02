import { open, readFile, stat, lstat, realpath, mkdir, rename, unlink, rmdir } from "node:fs/promises";
import { dirname, basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { contextRecords, exportItem, type Workspace } from "../../planning-core/src/index.js";
import { applyOperations, emptyWorkspace, type Batch } from "./operations.js";
import { validateDocuments } from "./documents.js";

export const MAX_BYTES = 24 * 1024 * 1024;
export function defaultWorkspacePath() {
  const folder = process.platform === "darwin" ? join(homedir(), "Library", "Application Support")
    : process.platform === "win32" ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
      : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(folder, "dev.codaru.planning", "workspace.json");
}
async function canonical(path: string) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const info = await lstat(absolute).catch(error => { if (error.code !== "ENOENT") throw error; });
  if (info?.isSymbolicLink()) throw new Error("Indica el archivo real, no un enlace simbólico.");
  return join(await realpath(dirname(absolute)), basename(absolute));
}
export async function readWorkspace(path: string): Promise<Workspace> {
  if ((await stat(path)).size > MAX_BYTES) throw new Error("El espacio excede 24 MiB.");
  const bytes = await readFile(path);
  if (bytes.length > MAX_BYTES) throw new Error("El espacio excede 24 MiB.");
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  validateDocuments(value); return value;
}
async function atomicWrite(path: string, bytes: string) {
  const temp = `${path}.${randomUUID()}.pending`;
  const file = await open(temp, "wx", 0o600);
  try { await file.writeFile(bytes, "utf8"); await file.sync(); }
  catch (error) { await file.close(); await unlink(temp).catch(() => {}); throw error; }
  await file.close();
  try { await rename(temp, path); }
  catch (error) { await unlink(temp).catch(() => {}); throw error; }
}
/** Shared with Tauri's DirectoryLock; never steal a lock from a slow writer. */
export async function withWorkspaceLock<T>(path: string, action: (canonicalPath: string) => Promise<T>, timeoutMs = 5000): Promise<T> {
  path = await canonical(path);
  const lock = `${path}.write-lock`, deadline = Date.now() + timeoutMs;
  while (true) {
    try { await mkdir(lock, { mode: 0o700 }); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error(`Espacio ocupado: ${lock}. Si hubo un cierre inesperado, verifica que no haya escritores activos antes de retirar el directorio de bloqueo vacío.`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  try { return await action(path); } finally { await rmdir(lock); }
}
async function writeContext(path: string, ws: Workspace) {
  const folder = join(dirname(path), basename(path) === "workspace.json" ? "context" : `${basename(path)}.context`);
  await mkdir(folder, { recursive: true });
  for (const item of ws.items) await atomicWrite(join(folder, `${item.id}.md`), exportItem(ws, item));
  await atomicWrite(join(folder, "index.json"), JSON.stringify({ schemaVersion: 1, workspaceRevision: ws.revision, items: contextRecords(ws) }, null, 2));
}
async function commit(path: string, previous: Workspace | undefined, ws: Workspace) {
  const bytes = JSON.stringify(ws, null, 2);
  if (Buffer.byteLength(bytes) > MAX_BYTES) throw new Error("El espacio excede 24 MiB. No se guardaron cambios.");
  if (previous) {
    const backup = basename(path) === "workspace.json" ? join(dirname(path), "workspace.previous.json") : `${path}.previous.json`;
    await atomicWrite(backup, JSON.stringify(previous, null, 2));
  }
  await atomicWrite(path, bytes);
  let contextWarning: string | undefined;
  try { await writeContext(path, ws); } catch (error) { contextWarning = String(error); }
  return { path, revision: ws.revision, ...(contextWarning ? { contextWarning } : {}) };
}
export async function initializeWorkspace(path: string, name: string) {
  return withWorkspaceLock(path, async canonicalPath => {
    const existing = await stat(canonicalPath).catch(error => { if (error.code !== "ENOENT") throw error; });
    if (existing) throw new Error("El espacio ya existe; init nunca lo reemplaza.");
    const ws = emptyWorkspace(name); ws.revision = 1;
    return commit(canonicalPath, undefined, ws);
  });
}
export async function applyToFile(path: string, batch: Batch, dryRun = false) {
  if (dryRun) {
    const result = applyOperations(await readWorkspace(path), batch);
    if (Buffer.byteLength(JSON.stringify(result.workspace, null, 2)) > MAX_BYTES) throw new Error("El espacio excedería 24 MiB.");
    return { dryRun: true, revision: batch.expectedRevision, nextRevision: batch.expectedRevision + 1, refs: result.refs, affectedIds: result.affectedIds };
  }
  return withWorkspaceLock(path, async canonicalPath => {
    const previous = await readWorkspace(canonicalPath);
    const result = applyOperations(previous, batch);
    result.workspace.revision = previous.revision + 1;
    return { ...(await commit(canonicalPath, previous, result.workspace)), dryRun: false, refs: result.refs, affectedIds: result.affectedIds };
  });
}
