import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, chmodSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const outdir = resolve(root, "packages/planning/dist");
const pkg = JSON.parse(readFileSync(resolve(root, "packages/planning/package.json"), "utf8"));
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: { index: "packages/planning/src/index.ts", files: "packages/planning/src/files.ts", cli: "packages/planning/src/cli.ts" },
  outdir, bundle: true, splitting: true, format: "esm", platform: "node", target: "node22",
  external: Object.keys(pkg.dependencies), sourcemap: false,
  define: { __PLANNING_VERSION__: JSON.stringify(pkg.version) },
});
execFileSync(resolve(root, "node_modules/.bin/tsc"), ["-p", "packages/planning/tsconfig.build.json"], { cwd: root, stdio: "inherit" });
chmodSync(resolve(outdir, "cli.js"), 0o755);
