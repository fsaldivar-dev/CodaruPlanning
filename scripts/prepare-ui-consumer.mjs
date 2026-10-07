// Installs only the tarball and documented peers, outside this repository.
import { mkdtempSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const tarball = resolve(process.argv[2] || 'artifacts/fsaldivar.dev-planning-0.5.0.tgz');
const folder = mkdtempSync(join(tmpdir(), 'planning-ui-consumer-'));
const manifest = JSON.parse(readFileSync('packages/planning/package.json', 'utf8'));
const root = JSON.parse(readFileSync('package.json', 'utf8'));
writeFileSync(join(folder, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { '@fsaldivar.dev/planning': tarball, ...manifest.peerDependencies }, devDependencies: { vite: root.devDependencies.vite, typescript: root.devDependencies.typescript } }));
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: folder, stdio: 'pipe' });
cpSync(join(folder, 'node_modules/@fsaldivar.dev/planning/examples/composable-ui'), folder, { recursive: true });
writeFileSync(join(folder, 'vite.config.js'), 'export default { base: "./", build: {target: "safari16"} };\n');
execFileSync(join(folder, 'node_modules/.bin/tsc'), ['--noEmit', '--types', 'vite/client', '--strict', '--skipLibCheck', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--lib', 'es2022,dom,dom.iterable', 'main.ts'], { cwd: folder, stdio: 'inherit' });
execFileSync(join(folder, 'node_modules/.bin/vite'), ['build'], { cwd: folder, stdio: 'inherit' });
console.log(JSON.stringify({ folder, servedFromInstalledTarball: true, usesAppSource: false }));
