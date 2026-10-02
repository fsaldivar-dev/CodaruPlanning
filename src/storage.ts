import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  contextRecords,
  exportItem,
  initialWorkspace,
  validateWorkspace,
  type Workspace,
} from "@codaru/planning-core";
const key = "codaru-planning-workspace-v1";
export const native = isTauri();
let workspace: Workspace;
let version = 0,
  savedVersion = 0,
  timer: ReturnType<typeof setTimeout> | undefined,
  inflight: Promise<void> | undefined;
export let dataFolder = "Almacenamiento de la vista previa";
let reporter: (state: string, error?: string) => void = () => {};
export function reportStorage(fn: typeof reporter) {
  reporter = fn;
}
export async function load(): Promise<Workspace> {
  const data = native
    ? await invoke<Workspace | null>("load_workspace")
    : JSON.parse(localStorage.getItem(key) || "null");
  if (data) {
    validateWorkspace(data);
    workspace = data;
  } else workspace = initialWorkspace();
  if (native) dataFolder = await invoke<string>("storage_path");
  return workspace;
}
export function current() {
  return workspace;
}
export async function refreshExternal(canReplace: () => boolean, validate: (value: Workspace) => void): Promise<boolean> {
  if (!native || savedVersion !== version || inflight || !canReplace()) return false;
  const capturedVersion = version;
  const candidate = await invoke<Workspace | null>("load_workspace");
  if (!candidate || candidate.revision === workspace.revision) return false;
  validateWorkspace(candidate);
  validate(candidate);
  // An edit or dialog may have started during the native read.
  if (capturedVersion !== version || savedVersion !== version || inflight || !canReplace()) return false;
  workspace = candidate;
  reporter("Guardado localmente");
  return true;
}
export function replace(value: Workspace) {
  const rev = workspace.revision;
  workspace = value;
  workspace.revision = rev;
  changed();
}
export function changed() {
  version++;
  reporter("Guardando…");
  clearTimeout(timer);
  timer = setTimeout(() => void flush().catch(() => {}), 350);
}
export async function flush(): Promise<void> {
  clearTimeout(timer);
  if (inflight) {
    await inflight;
    if (savedVersion < version) return flush();
    return;
  }
  if (savedVersion === version) return;
  inflight = (async () => {
    let contextWarning: string | undefined;
    while (savedVersion < version) {
      const snapshot = structuredClone(workspace),
        captureVersion = version,
        expectedRevision = workspace.revision;
      try {
        if (native) {
          const result = await invoke<{
            revision: number;
            path: string;
            contextError?: string;
          }>("save_workspace", {
            workspace: snapshot,
            expectedRevision,
            context: {
              index: { schemaVersion: 1, items: contextRecords(snapshot) },
              documents: snapshot.items.map((i) => ({
                id: i.id,
                markdown: exportItem(snapshot, i),
              })),
            },
          });
          workspace.revision = result.revision;
          contextWarning = result.contextError;
        } else {
          const existing = JSON.parse(localStorage.getItem(key) || "null");
          if (existing && existing.revision !== expectedRevision)
            throw new Error(
              "Otra ventana modificó el espacio. Exporta tus cambios antes de recargar.",
            );
          snapshot.revision = expectedRevision + 1;
          localStorage.setItem(key, JSON.stringify(snapshot));
          workspace.revision = snapshot.revision;
        }
        savedVersion = captureVersion;
      } catch (error) {
        reporter("No se pudo guardar", String(error));
        throw error;
      }
    }
    reporter(
      contextWarning ? "Guardado; contexto pendiente" : "Guardado localmente",
      contextWarning,
    );
  })();
  try {
    await inflight;
  } finally {
    inflight = undefined;
  }
}
export async function exportSpace(): Promise<boolean> {
  await flush().catch(() => {});
  if (native) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: "Codaru Planning.json",
      filters: [{ name: "Espacio Codaru", extensions: ["json"] }],
    });
    if (!path) return false;
    await invoke("export_workspace", { path, workspace });
  } else {
    download(
      "codaru-planning.json",
      JSON.stringify(workspace, null, 2),
      "application/json",
    );
  }
  return true;
}
export function download(name: string, body: string, mime = "text/markdown") {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function chooseImport(): Promise<Workspace | null> {
  if (!native)
    throw new Error(
      "La importación está disponible en la aplicación de escritorio.",
    );
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({
    multiple: false,
    filters: [{ name: "Espacio Codaru", extensions: ["json"] }],
  });
  if (!path) return null;
  const data = await invoke<Workspace>("import_workspace", { path });
  validateWorkspace(data);
  return data;
}

export async function exportText(name: string, body: string) {
  if (!native) {
    download(name, body);
    return;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: name,
    filters: [{ name: "Documento", extensions: ["md"] }],
  });
  if (path) await invoke("export_text", { path, body });
}
