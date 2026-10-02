import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const bytes = (paths) => paths.reduce((sum, p) => sum + statSync(p).size, 0);
const mib = (value) => (value / 1024 / 1024).toFixed(2) + " MiB";
const assets = files("dist");
const code = assets.filter((p) => /\.(js|css)$/.test(p));
console.log("Recursos de interfaz:", mib(bytes(assets)));
console.log("JS + CSS:", mib(bytes(code)));
console.log(
  "JS + CSS comprimidos:",
  mib(code.reduce((n, p) => n + gzipSync(readFileSync(p)).length, 0)),
);
const app = "src-tauri/target/release/bundle/macos/Codaru Planning.app";
if (existsSync(app))
  console.log("Aplicación macOS completa:", mib(bytes(files(app))));
