import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const required = ['index.html', 'app.js', 'style.css', 'assets/gizmo.glb', 'vendor/three.module.min.js', 'vendor/three.core.min.js', 'vendor/GLTFLoader.js', 'vendor/BufferGeometryUtils.js', 'vendor/THREE-LICENSE.txt'];
for (const file of required) assert((await stat(resolve(root, file))).size > 0, `${file} is empty`);

const html = await readFile(resolve(root, 'index.html'), 'utf8');
const app = await readFile(resolve(root, 'app.js'), 'utf8');
const importMap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const imports = new Set(Object.keys(importMap));
let checked = 0;
async function checkReference(file, target) {
  if (/^(?:data:|https?:|#)/.test(target)) return;
  assert(!target.startsWith('/'), `Root-relative URL breaks project Pages: ${target}`);
  const path = resolve(dirname(file), target.split(/[?#]/)[0]);
  assert(!relative(root, path).startsWith('..'), `Reference escapes dist: ${target}`);
  assert((await stat(path)).isFile(), `Missing asset: ${target}`);
  checked++;
}
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) await checkReference(resolve(root, 'index.html'), match[1]);
for (const target of Object.values(importMap)) await checkReference(resolve(root, 'index.html'), target);
for (const match of app.matchAll(/\.load\(['"](\.[^'"]+)['"]/g)) await checkReference(resolve(root, 'app.js'), match[1]);

async function walk(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const file = resolve(path, item.name);
    if (item.isDirectory()) await walk(file);
    else if (file.endsWith('.js')) {
      execFileSync(process.execPath, ['--check', file]);
      const code = await readFile(file, 'utf8');
      for (const match of code.matchAll(/^[ \t]*import\s*(?:[\w*$\s{},]+?\bfrom\s*)?['"]([^'"]+)['"]/gm)) {
        if (imports.has(match[1])) continue;
        await checkReference(file, match[1]);
      }
    }
  }
}
await walk(root);

const glb = await readFile(resolve(root, 'assets/gizmo.glb'));
assert.equal(glb.toString('ascii', 0, 4), 'glTF', 'Invalid model magic');
assert.equal(glb.readUInt32LE(4), 2, 'Expected glTF 2');
assert.equal(glb.readUInt32LE(8), glb.length, 'Truncated model');
assert.equal(glb.readUInt32LE(16), 0x4e4f534a, 'Model JSON chunk missing');
const model = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
assert(model.nodes.some(n => n.name === 'Body'), 'Gizmo body missing');
assert(model.nodes.some(n => n.name?.startsWith('Hat')), 'Gizmo hat missing');
assert(model.nodes.some(n => n.name?.startsWith('Eye')), 'Gizmo eyes missing');
assert(model.buffers.every(b => !b.uri), 'Expected a self-contained model');
console.log(`Validated JavaScript, ${checked} local references, and Gizmo model (${glb.length} bytes).`);
