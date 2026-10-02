import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, chmodSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const outdir = resolve(root, "packages/planning/dist");
const pkg = JSON.parse(readFileSync(resolve(root, "packages/planning/package.json"), "utf8"));
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: { index: "packages/planning/src/index.ts", files: "packages/planning/src/files.ts", cli: "packages/planning/src/cli.ts", markdown: "packages/planning/src/markdown.ts", editor: "packages/planning/src/ui/editor.ts", "editor-commands": "packages/planning/src/ui/editor/blocks.ts", components: "packages/planning/src/ui/components.ts", mermaid: "packages/planning/src/ui/mermaid.ts", navigation: "packages/planning/src/ui/navigation.ts" },
  outdir, bundle: true, splitting: true, format: "esm", platform: "neutral", target: ["node22", "safari16"],
  external: [...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies), "node:*"], sourcemap: false,
  define: { __PLANNING_VERSION__: JSON.stringify(pkg.version) },
});
await build({ absWorkingDir: root, entryPoints: { editor: "packages/planning/src/ui/editor.css", components: "packages/planning/src/ui/components.css" }, outdir, bundle: true, minify: true, target: "safari16" });
execFileSync(resolve(root, "node_modules/.bin/tsc"), ["-p", "packages/planning/tsconfig.build.json"], { cwd: root, stdio: "inherit" });
chmodSync(resolve(outdir, "cli.js"), 0o755);

writeFileSync(resolve(outdir, "styles.d.ts"), "export {};\n");
