import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const required = ['index.html', 'app.js', 'style.css', 'garden-assets.js', 'assets/gizmo.glb', 'assets/dream-kit.glb', 'assets/world-textures/sources.json', 'vendor/three.module.min.js', 'vendor/three.core.min.js', 'vendor/GLTFLoader.js', 'vendor/HDRLoader.js', 'vendor/BufferGeometryUtils.js', 'vendor/THREE-LICENSE.txt'];
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
      for (const match of code.matchAll(/\.load(?:Async)?\(\s*(['"])(\.[^'"]+)\1/g)) await checkReference(file, match[2]);
    }
  }
}
await walk(root);

async function readGlb(file) {
  const bytes = await readFile(resolve(root, file));
  assert(bytes.length >= 20, `${file}: incomplete GLB header`);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${file}: invalid GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${file}: expected glTF 2`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${file}: truncated model`);
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    assert(offset + 8 <= bytes.length, `${file}: truncated chunk header`);
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    assert(length % 4 === 0 && offset + 8 + length <= bytes.length, `${file}: invalid chunk length`);
    chunks.push({ type, bytes: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  assert.equal(chunks[0]?.type, 0x4e4f534a, `${file}: JSON chunk missing`);
  const model = JSON.parse(chunks[0].bytes.toString('utf8'));
  const binary = chunks.find(chunk => chunk.type === 0x004e4942)?.bytes;
  assert(binary, `${file}: embedded geometry buffer missing`);
  assert.equal(model.buffers?.length, 1, `${file}: expected one embedded buffer`);
  assert(!model.buffers[0].uri, `${file}: external geometry dependency`);
  const bufferLength = model.buffers[0].byteLength;
  assert(Number.isInteger(bufferLength) && bufferLength > 0 && binary.length >= bufferLength && binary.length - bufferLength <= 3, `${file}: invalid embedded buffer length`);
  for (const view of model.bufferViews || []) {
    const offset = view.byteOffset || 0;
    assert(view.buffer === 0 && Number.isInteger(offset) && offset >= 0 && Number.isInteger(view.byteLength) && view.byteLength > 0 && offset + view.byteLength <= bufferLength, `${file}: buffer view exceeds embedded data`);
  }
  for (const image of model.images || []) {
    assert(!image.uri && model.bufferViews?.[image.bufferView], `${file}: image is not embedded`);
  }
  return { model, bytes: bytes.length };
}

const gizmo = await readGlb('assets/gizmo.glb');
const model = gizmo.model;
assert(model.nodes.some(n => n.name === 'Body'), 'Gizmo body missing');
assert(model.nodes.some(n => n.name?.startsWith('Hat')), 'Gizmo hat missing');
assert(model.nodes.some(n => n.name?.startsWith('Eye')), 'Gizmo eyes missing');

const worldKit = await readGlb('assets/dream-kit.glb');
const kit = worldKit.model;
const scene = kit.scenes?.[kit.scene ?? 0];
assert(scene?.nodes?.length, 'World kit default scene is empty');
function descendants(index, ancestors = new Set()) {
  assert(Number.isInteger(index) && kit.nodes?.[index], `World kit has an invalid node reference: ${index}`);
  assert(!ancestors.has(index), 'World kit scene graph contains a cycle');
  const branch = new Set(ancestors).add(index);
  return [index, ...(kit.nodes[index].children || []).flatMap(child => descendants(child, branch))];
}
const reachable = new Set(scene.nodes.flatMap(index => descendants(index)));
const groups = ['JellyBell', 'LotusPlatform', 'CrystalCluster', 'PrismRelay', 'Orrery', 'GateFrame', 'DreamEngine'];
for (const name of groups) {
  const matches = [...reachable].filter(index => kit.nodes[index].name === name);
  assert.equal(matches.length, 1, `World kit needs exactly one reachable ${name} group`);
  const meshes = descendants(matches[0]).map(index => kit.nodes[index].mesh).filter(index => index !== undefined);
  assert(meshes.length, `World kit ${name} contains no geometry`);
  for (const index of meshes) {
    const primitives = kit.meshes?.[index]?.primitives;
    assert(primitives?.length, `World kit ${name} references an empty mesh`);
    for (const primitive of primitives) {
      const position = kit.accessors?.[primitive.attributes?.POSITION];
      assert(position?.count > 0, `World kit ${name} has no vertices`);
      for (const attribute of ['NORMAL', 'TEXCOORD_0']) {
        assert.equal(kit.accessors?.[primitive.attributes?.[attribute]]?.count, position.count, `World kit ${name} has missing/incomplete ${attribute} data`);
      }
    }
  }
}

// These names come from the runtime loader, including its dynamically constructed texture URLs.
const assetFile = resolve(root, 'garden-assets.js');
const assetCode = await readFile(assetFile, 'utf8');
const textureFiles = new Set([...assetCode.matchAll(/['"]([^'"\n]+\.(?:jpe?g|png|webp|hdr))['"]/g)].map(match => match[1]));
assert(textureFiles.size >= 1, 'World loader must include the HDR lighting environment');
const sources = JSON.parse(await readFile(resolve(root, 'assets/world-textures/sources.json'), 'utf8'));
for (const texture of textureFiles) {
  const target = texture.startsWith('.') ? texture : `./assets/world-textures/${texture}`;
  await checkReference(assetFile, target);
  const bytes = await readFile(resolve(dirname(assetFile), target));
  if (/\.jpe?g$/i.test(texture)) assert(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff, `${texture}: invalid JPEG header`);
  if (/\.hdr$/i.test(texture)) {
    const header = bytes.toString('ascii', 0, Math.min(bytes.length, 2048));
    assert(/^#\?(?:RADIANCE|RGBE)/.test(header) && /FORMAT=32-bit_rle_rgbe/.test(header) && /[+-]Y\s+\d+\s+[+-]X\s+\d+/.test(header), `${texture}: invalid Radiance environment header`);
  }
  const filename = texture.split('/').at(-1), source = sources.find(entry => entry.file === filename);
  assert(source?.sha256 && source.size === bytes.length, `${texture}: missing or stale source record`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, `${texture}: bytes do not match source checksum`);
}

const toolOrder = ['poke', 'slap', 'pull', 'brush', 'turn'];
const toolButtons = [...html.matchAll(/<button\b[^>]*\bdata-tool=(['"])([^'"]+)\1[^>]*>/g)];
assert.deepEqual(toolButtons.map(match => match[2]), toolOrder, 'Toolbar order must be Poke, Slap, Pull, Brush, Turn');
const shortcuts = [...app.matchAll(/(['"])([1-5])\1\s*:\s*(['"])(poke|slap|pull|brush|turn)\3/g)];
for (const [index, tool] of toolOrder.entries()) {
  const key = String(index + 1);
  assert.deepEqual([...new Set(shortcuts.filter(match => match[2] === key).map(match => match[4]))], [tool], `Shortcut ${key} does not match the visible ${tool} control`);
  assert(toolButtons[index][0].includes(`(${key})`), `${tool} tooltip does not advertise shortcut ${key}`);
}

console.log(`Validated JavaScript, ${checked} local references, both GLBs (${gizmo.bytes + worldKit.bytes} bytes), ${groups.length} world groups, ${textureFiles.size} texture checksums, and toolbar shortcuts.`);
