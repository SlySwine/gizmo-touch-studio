import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { createHatContactMap } from '../fur-contact.js';

const HAT_OFFSET = new THREE.Vector3(-.32, -.16, 0);
const SCALE = .385;
const clamp = THREE.MathUtils.clamp;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

/** Original Astra mesh, in metres. The returned group's origin is Gizmo's feet.
 * +Z is forward. update accepts {player:{x,y,z,vx,vy,vz,yaw,grounded},
 * charge:{active,power},reaction,camera}. Animation never changes model physics.
 * Groom arrays use the original GLB's body-local coordinates, before SCALE.
 */
export async function createNeonCharacter({ scene, coarse = false } = {}) {
  const loaded = await new GLTFLoader().loadAsync(new URL('../assets/gizmo.glb', import.meta.url).href);
  const group = new THREE.Group();
  group.name = 'Gizmo · original Astra character';
  const spring = new THREE.Group();
  spring.scale.setScalar(SCALE);
  group.add(spring);
  const rig = loaded.scene;
  rig.position.y = .035;
  spring.add(rig);
  const eyes = [], hats = [];
  let body;
  const grain = createGrain();
  rig.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.material.dispose();
    if (mesh.name === 'Body') {
      body = mesh;
      const p = mesh.geometry.attributes.position;
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i) - 1.9, z = p.getZ(i);
        uv[i * 2] = .5 + Math.atan2(x, z) / (Math.PI * 2);
        uv[i * 2 + 1] = .5 + Math.asin(clamp(y / Math.max(.001, Math.hypot(x, y, z)), -1, 1)) / Math.PI;
      }
      mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      mesh.material = new THREE.MeshStandardMaterial({ color: 0xc71b70, roughness: 1, bumpMap: grain, bumpScale: .052 });
    } else if (mesh.name.startsWith('Hat')) {
      mesh.position.add(HAT_OFFSET);
      mesh.material = new THREE.MeshStandardMaterial({ color: mesh.name === 'HatBand' ? 0x18131e : 0x090912, roughness: mesh.name === 'HatBand' ? .65 : .93, bumpMap: grain, bumpScale: .021 });
      hats.push(mesh);
    } else {
      mesh.material = new THREE.MeshStandardMaterial({ color: 0x030208, roughness: .9 });
      if (mesh.name.startsWith('Eye')) eyes.push(mesh);
    }
  });
  if (!body) throw new Error('The original Gizmo mesh is missing its Body.');
  const contact = createHatContactMap(hats);
  // A soft hat follows the crown but resists most of the body's squash. The fur
  // samples this same live transform, so rebound cannot expose an old bald patch
  // or send hairs through the brim when the silhouette widens.
  const hatPivot = new THREE.Group();
  hatPivot.name = 'Soft bowler suspension';
  const brim = hats.find(mesh => mesh.name === 'HatBrim');
  brim?.geometry.computeBoundingBox();
  const hatAnchor = brim ? brim.geometry.boundingBox.getCenter(new THREE.Vector3()) : contact.center.clone();
  hatAnchor.add(HAT_OFFSET);
  // Resisting compression around the lowest brim edge keeps the crown above
  // the expanding lobe. A centre pivot would push its near edge into the body.
  if (brim) hatAnchor.y = brim.geometry.boundingBox.min.y + HAT_OFFSET.y;
  hatPivot.position.copy(hatAnchor);
  rig.add(hatPivot);
  for (const hat of hats) {
    hat.position.sub(hatAnchor);
    hatPivot.add(hat);
  }
  const hatRest = new THREE.Matrix4().makeTranslation(HAT_OFFSET.x - hatAnchor.x, HAT_OFFSET.y - hatAnchor.y, HAT_OFFSET.z - hatAnchor.z);
  const support = [];
  const bodyPositions = body.geometry.attributes.position;
  for (let i = 0; i < bodyPositions.count; i++) {
    if (bodyPositions.getY(i) < .6) support.push(bodyPositions.getX(i), bodyPositions.getY(i) + rig.position.y, bodyPositions.getZ(i));
  }
  const outerCount = coarse ? 20000 : 30000;
  const innerCount = coarse ? 32000 : 48000;
  const samples = sampleSurface(body.geometry, outerCount + innerCount);
  const uniforms = {
    localCamera: { value: new THREE.Vector3(0, 3, 12) },
    wind: { value: new THREE.Vector3() },
    clock: { value: 0 },
    mood: { value: new THREE.Vector2() },
    energy: { value: 0 },
    localFloor: { value: new THREE.Vector4(0, SCALE, 0, SCALE * rig.position.y) },
    hatContactMap: { value: contact.texture },
    hatContactBounds: { value: contact.bounds },
    hatHeightRange: { value: contact.heightRange },
    hatCenter: { value: contact.center },
    hatToRig: { value: new THREE.Matrix4().makeTranslation(...HAT_OFFSET.toArray()) },
    rigToHat: { value: new THREE.Matrix4().makeTranslation(...HAT_OFFSET.clone().negate().toArray()) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Gizmo · velvet fleece and groomed guard hairs',
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: furVertex,
    fragmentShader: furFragment,
  });
  const outer = makeCoat(samples, 0, outerCount, false, material);
  const undercoat = makeCoat(samples, outerCount, innerCount, true, material);
  rig.add(undercoat, outer);
  scene?.add(group);

  let disposed = false, squash = 0, squashVelocity = 0, lastGrounded = true;
  let lastVy = 0, blinkAt = 2.8, blinkStart = -100, surprise = 0, pleased = 0;
  let gait = 0, lastReaction = null, groomRevision = 0;
  let wasCharging = false, heldPower = 0, focus = 0, rebound = 0;
  let hatLift = 0, hatVelocity = 0, hatRock = 0, hatRockVelocity = 0;
  let currentHeight = 1;
  const cameraPosition = new THREE.Vector3();
  const localVelocity = new THREE.Vector3();
  const inverse = new THREE.Quaternion();

  function update(time, dt, state = {}) {
    if (disposed) return;
    const p = state.player || state;
    dt = clamp(finite(dt), 0, .05);
    time = finite(time);
    const vx = finite(p.vx), vy = finite(p.vy), vz = finite(p.vz);
    const speed = Math.min(35, Math.hypot(vx, vz));
    const grounded = p.grounded !== false;
    const charging = Boolean(state.charge?.active) && grounded;
    const power = clamp(finite(state.charge?.power), 0, 1);
    group.position.set(finite(p.x, group.position.x), finite(p.y, group.position.y), finite(p.z, group.position.z));
    const yaw = finite(p.yaw, speed > .03 ? Math.atan2(vx, vz) : group.rotation.y);
    const yawDifference = Math.atan2(Math.sin(yaw - group.rotation.y), Math.cos(yaw - group.rotation.y));
    group.rotation.y += yawDifference * (1 - Math.exp(-dt * 13));

    const landed = grounded && !lastGrounded;
    const launched = !grounded && lastGrounded && vy > 1;
    if (landed) {
      const impact = Math.min(3.1, Math.abs(lastVy) * .27 + .5);
      squashVelocity -= impact;
      hatVelocity += impact * .24;
      hatRockVelocity -= impact * .075;
      rebound = Math.max(rebound, impact * .22);
      surprise = Math.max(surprise, .45);
    }
    if (launched) {
      squashVelocity += wasCharging ? 3.6 + heldPower * 2 : 1.05;
      hatVelocity += wasCharging ? .35 + heldPower * .5 : .12;
      hatRockVelocity += wasCharging ? .17 + heldPower * .15 : .08;
      rebound = Math.max(rebound, wasCharging ? .45 + heldPower * .55 : .25);
      surprise = wasCharging ? 1 : .85;
    }
    lastGrounded = grounded;
    lastVy = vy;
    const reaction = state.reaction || p.reaction;
    const reactionId = reaction?.id ?? reaction?.at ?? reaction;
    if (reaction && reactionId !== lastReaction) {
      lastReaction = reactionId;
      if (['brush', 'success', 'chime', 'garden-awake'].includes(reaction.kind)) {
        pleased = 1;
        if (reaction.kind === 'chime' || reaction.kind === 'garden-awake') {
          squashVelocity += .75;
          hatRockVelocity += .14;
        }
      } else if (reaction.kind === 'charge-release') {
        // The public model sends this with the upward velocity in the same step.
        // Do not apply a second impulse after detecting that launch above.
        surprise = 1;
      } else if (reaction.kind !== 'charge-cancel') { surprise = 1; squashVelocity -= .7; }
    }
    if (charging) heldPower = power;
    wasCharging = charging;
    focus += ((charging ? power : 0) - focus) * (1 - Math.exp(-dt * 12));
    rebound *= Math.exp(-dt * 4);
    const target = charging ? -.08 - power * .32 : 0;
    // Substeps give the same damped, volume-preserving response at low frame
    // rates. Cancel eases upright; only an actual launch adds a release impulse.
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      squashVelocity += ((target - squash) * 112 - squashVelocity * (charging ? 19 : 8.5)) * h;
      squashVelocity = clamp(squashVelocity, -5.5, 5.5);
      squash = clamp(squash + squashVelocity * h, -.44, .27);
      if (squash <= -.44 && squashVelocity < 0 || squash >= .27 && squashVelocity > 0) squashVelocity = 0;
      hatVelocity += (-hatLift * 95 - hatVelocity * 10) * h;
      hatLift = clamp(hatLift + hatVelocity * h, 0, .15);
      if (hatLift === 0 && hatVelocity < 0) hatVelocity = 0;
      hatRockVelocity += (-hatRock * 95 - hatRockVelocity * 8) * h;
      hatRock = clamp(hatRock + hatRockVelocity * h, -.055, .055);
    }
    gait += speed * dt * 2.8;
    const running = clamp(speed / 5, 0, 1);
    const step = grounded && !charging ? Math.sin(gait * 2) * running : 0;
    const tension = charging ? Math.sin(time * (25 + power * 8)) * .003 * power : 0;
    const height = clamp(1 + squash + step * .025 + tension, .56, 1.3);
    currentHeight = height;
    const width = 1 / Math.sqrt(height);
    spring.scale.set(SCALE * width, SCALE * height, SCALE * width);
    spring.rotation.z = (charging ? Math.sin(time * 31) * .003 * power : Math.sin(gait) * .055 * running);
    spring.rotation.x = charging ? -.012 * power : -.07 * running + clamp(vy * -.009, -.045, .045);
    spring.updateMatrix();
    const m = spring.matrix.elements;
    let lowest = Infinity;
    for (let i = 0; i < support.length; i += 3) lowest = Math.min(lowest, m[1] * support[i] + m[5] * support[i + 1] + m[9] * support[i + 2]);
    spring.position.y = Math.max(0, .012 - lowest) + (grounded && !charging ? Math.abs(Math.sin(gait)) * .025 * running : 0);
    uniforms.localFloor.value.set(m[1], m[5], m[9], spring.position.y + m[5] * rig.position.y);
    hatPivot.position.copy(hatAnchor);
    hatPivot.position.y += hatLift;
    hatPivot.rotation.z = hatRock;
    hatPivot.rotation.x = hatRock * -.45;
    hatPivot.scale.set(Math.pow(width, -.7), Math.pow(height, -.7), Math.pow(width, -.7));
    hatPivot.updateMatrix();
    uniforms.hatToRig.value.multiplyMatrices(hatPivot.matrix, hatRest);
    uniforms.rigToHat.value.copy(uniforms.hatToRig.value).invert();

    if (time > blinkAt) { blinkStart = time; blinkAt = time + 3.4 + Math.sin(time * 7.3) * 1.1; }
    const blinkPhase = clamp((time - blinkStart) / .2, 0, 1);
    const blink = Math.max(Math.sin(blinkPhase * Math.PI) ** 2, focus * .28);
    surprise *= Math.exp(-dt * 3.4);
    pleased *= Math.exp(-dt * .8);
    for (const eye of eyes) {
      const dictionary = eye.morphTargetDictionary, values = eye.morphTargetInfluences;
      if (!dictionary || !values) continue;
      for (const [name, value] of [['Blink', eye.name.includes('Pupil') ? blink : 0], ['Surprised', surprise * .75], ['Smug', Math.max(pleased * .65, focus * .13)], ['Skeptical', 0]]) {
        if (dictionary[name] !== undefined) values[dictionary[name]] = value;
      }
    }
    uniforms.clock.value = time;
    uniforms.mood.value.set(surprise * .75, blink);
    uniforms.energy.value = Math.min(1, focus * .25 + rebound);
    inverse.copy(group.quaternion).invert();
    localVelocity.set(vx, vy * .3, vz).applyQuaternion(inverse).multiplyScalar(-.009);
    localVelocity.clampLength(0, .18);
    uniforms.wind.value.lerp(localVelocity, 1 - Math.exp(-dt * 9));
    if (state.camera?.isCamera) {
      group.updateWorldMatrix(true, true);
      state.camera.getWorldPosition(cameraPosition);
      rig.worldToLocal(cameraPosition);
      uniforms.localCamera.value.copy(cameraPosition);
    }
  }

  /** Accept sampled Studio outer-fur roots, normals, grooming vectors and seeds.
   * Sampling must copy all four values from each selected original strand.
   * This replaces guard hairs exactly, then transfers grooming to nearby fleece.
   */
  function setGroom(payload) {
    if (disposed || !payload) return false;
    const { roots, normals, groom, seeds } = payload;
    const count = Math.floor((roots?.length || 0) / 3);
    if (count < 1 || roots.length !== count * 3 || normals?.length !== count * 3 || groom?.length !== count * 3 || seeds?.length !== count || count > 600000) return false;
    // Validate before changing a single attribute; malformed cross-frame input is inert.
    for (let i = 0; i < count * 3; i++) {
      if (!Number.isFinite(roots[i]) || Math.abs(roots[i]) > 10 || !Number.isFinite(normals[i]) || Math.abs(normals[i]) > 1.01 || !Number.isFinite(groom[i]) || Math.abs(groom[i]) > 2) return false;
    }
    for (let i = 0; i < count; i++) {
      const j = i * 3, normalLength = Math.hypot(normals[j], normals[j + 1], normals[j + 2]);
      if (!Number.isFinite(seeds[i]) || normalLength < .5 || normalLength > 1.5) return false;
    }
    const take = Math.min(count, outerCount);
    const target = outer.geometry.attributes;
    for (let i = 0; i < take; i++) {
      const source = Math.floor(i * count / take), si = source * 3, ti = i * 3;
      for (let k = 0; k < 3; k++) {
        target.root.array[ti + k] = roots[si + k];
        target.hairNormal.array[ti + k] = normals[si + k];
        target.groom.array[ti + k] = groom[si + k];
      }
      target.seed.array[i] = clamp(seeds[source], 0, 1);
    }
    outer.geometry.instanceCount = take;
    for (const name of ['root', 'hairNormal', 'groom', 'seed']) target[name].needsUpdate = true;
    // Short pile lies beneath the long coat; a small spatial field makes its groom
    // direction match without sending hundreds of thousands of undercoat vectors.
    const field = new Map();
    const key = (x, y, z) => `${Math.floor(x * 7)},${Math.floor(y * 7)},${Math.floor(z * 7)}`;
    for (let i = 0; i < take; i++) {
      const j = i * 3, id = key(target.root.array[j], target.root.array[j + 1], target.root.array[j + 2]);
      let cell = field.get(id);
      if (!cell) { cell = [0, 0, 0, 0]; field.set(id, cell); }
      cell[0] += target.groom.array[j]; cell[1] += target.groom.array[j + 1]; cell[2] += target.groom.array[j + 2]; cell[3]++;
    }
    const fleece = undercoat.geometry.attributes;
    fleece.groom.array.fill(0);
    for (let i = 0; i < innerCount; i++) {
      const j = i * 3, cell = field.get(key(fleece.root.array[j], fleece.root.array[j + 1], fleece.root.array[j + 2]));
      if (cell) for (let k = 0; k < 3; k++) fleece.groom.array[j + k] = cell[k] / cell[3];
    }
    fleece.groom.needsUpdate = true;
    groomRevision++;
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    const geometries = new Set(), materials = new Set();
    group.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(mat => mat.dispose());
    grain.dispose();
    contact.texture.dispose();
  }
  return { group, update, setGroom, dispose, get state() { return { outerCount: outer.geometry.instanceCount, undercoatCount: innerCount, groomRevision, height: 1.61, forward: '+z', disposed, animation: { charging: wasCharging, compression: currentHeight, focus, rebound, hatLift } }; } };
}

function createGrain() {
  const size = 128, data = new Uint8Array(size * size * 4);
  let seed = 271828;
  for (let i = 0; i < data.length; i += 4) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const value = 75 + Math.floor(seed / 4294967296 * 180);
    data.set([value, value, value, 255], i);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(15, 15);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function sampleSurface(geometry, count) {
  const p = geometry.attributes.position, n = geometry.attributes.normal, index = geometry.index;
  const faceCount = (index ? index.count : p.count) / 3;
  const cumulative = new Float32Array(faceCount);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let sum = 0, seed = 0xabc173;
  const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const vertex = i => index ? index.getX(i) : i;
  for (let f = 0; f < faceCount; f++) {
    a.fromBufferAttribute(p, vertex(f * 3)); b.fromBufferAttribute(p, vertex(f * 3 + 1)); c.fromBufferAttribute(p, vertex(f * 3 + 2));
    sum += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * .5;
    cumulative[f] = sum;
  }
  const roots = new Float32Array(count * 3), normals = new Float32Array(count * 3), groom = new Float32Array(count * 3), seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const target = random() * sum;
    let lo = 0, hi = faceCount - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < target) lo = mid + 1; else hi = mid; }
    const va = vertex(lo * 3), vb = vertex(lo * 3 + 1), vc = vertex(lo * 3 + 2);
    const s = Math.sqrt(random()), u = 1 - s, v = random() * s, w = 1 - u - v;
    a.fromBufferAttribute(p, va); b.fromBufferAttribute(p, vb); c.fromBufferAttribute(p, vc);
    a.multiplyScalar(u).addScaledVector(b, v).addScaledVector(c, w).toArray(roots, i * 3);
    a.fromBufferAttribute(n, va); b.fromBufferAttribute(n, vb); c.fromBufferAttribute(n, vc);
    a.multiplyScalar(u).addScaledVector(b, v).addScaledVector(c, w).normalize().toArray(normals, i * 3);
    seeds[i] = random();
  }
  return { roots, normals, groom, seeds };
}

function makeCoat(samples, offset, count, short, material) {
  const geometry = new THREE.InstancedBufferGeometry();
  const vertices = short ? [-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0] : [-1, 0, 0, 1, 0, 0, -1, .5, 0, 1, .5, 0, -1, 1, 0, 1, 1, 0];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(short ? [0, 1, 2, 1, 3, 2] : [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
  for (const [name, key, size] of [['root', 'roots', 3], ['hairNormal', 'normals', 3], ['groom', 'groom', 3], ['seed', 'seeds', 1]]) {
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(samples[key].slice(offset * size, (offset + count) * size), size).setUsage(THREE.DynamicDrawUsage));
  }
  geometry.setAttribute('coat', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(short ? 1 : 0), 1));
  geometry.instanceCount = count;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 3.2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = short ? 'Close fleece undercoat' : 'Groomed long guard hairs';
  // The solid original mesh provides a stable, inexpensive shadow silhouette.
  mesh.castShadow = false;
  return mesh;
}

const furVertex = `
attribute vec3 root; attribute vec3 hairNormal; attribute vec3 groom;
attribute float seed; attribute float coat;
uniform vec3 localCamera; uniform vec3 wind; uniform float clock; uniform vec2 mood;
uniform float energy; uniform vec4 localFloor;
uniform sampler2D hatContactMap; uniform vec4 hatContactBounds;
uniform vec2 hatHeightRange; uniform vec3 hatCenter; uniform mat4 hatToRig; uniform mat4 rigToHat;
varying vec3 vColor;
float eyeDistance(vec3 p) {
  float browY=2.465+mood.x*.22;
  float lid=length(vec2(max(abs(abs(p.x)-.736)-.402,0.0),p.y-browY))-.145;
  vec2 pupilSize=vec2(.165*(1.0+mood.x*.45),.245*(1.0+mood.x*.55)*mix(1.0,.05,mood.y));
  float pupil=(length(vec2(abs(p.x)-.736,p.y-2.265-mood.y*.19)/pupilSize)-1.0)*min(pupilSize.x,pupilSize.y);
  return min(lid,pupil);
}
vec3 hatSurface(vec3 p) {
  vec2 uv=(p.xz-hatContactBounds.xy)/hatContactBounds.zw;
  float inside=step(0.0,uv.x)*step(0.0,uv.y)*step(uv.x,1.0)*step(uv.y,1.0);
  vec4 hit=texture2D(hatContactMap,clamp(uv,vec2(0),vec2(1)));
  float height=hatHeightRange.x+dot(hit.rg,vec2(65280.0,255.0))/65535.0*hatHeightRange.y;
  return vec3(height,inside*step(.5,hit.b),inside*hit.a);
}
void main() {
  float t=position.y;
  vec3 n=hairNormal;
  vec3 tangent=normalize(cross(n,abs(n.y)<.9?vec3(0,1,0):vec3(1,0,0)));
  vec3 bitangent=cross(n,tangent);
  vec3 viewDir=normalize(localCamera-root);
  float faceDistance=eyeDistance(root)-(1.0-coat)*min(.08,abs(viewDir.x)*.095+abs(viewDir.y)*.03);
  float trim=root.z>1.0?mix(.02,1.0,smoothstep(-.01,mix(.10,.025,coat),faceDistance)):1.0;
  float lengthHair=mix(.15+pow(seed,2.4)*.16,.038+seed*.05,coat)*trim;
  vec3 styling=groom*mix(1.0,.18,coat);
  float laid=clamp(length(styling)*3.4,0.0,.75);
  float angle=seed*62.83;
  vec3 curl=(tangent*cos(angle)+bitangent*sin(angle))*mix(.045+seed*.038,.015+seed*.018,coat);
  vec3 hatRoot=(rigToHat*vec4(root,1.0)).xyz;
  vec3 contact=hatSurface(hatRoot);
  float pressure=contact.z*(1.0-smoothstep(.015,.28,contact.x-hatRoot.y));
  vec3 outward=normalize(vec3(hatRoot.x-hatCenter.x,0.0,hatRoot.z-hatCenter.z)+vec3(.0001,0,.0001));
  outward=normalize(mat3(hatToRig)*outward);
  outward=normalize(outward-n*dot(outward,n)+vec3(.0001));
  vec3 flutter=tangent*sin(clock*(3.8+energy*7.0)+seed*23.0)*(.006+energy*.021);
  vec3 inertia=wind-n*dot(n,wind);
  vec3 bend=(curl+vec3(0,-lengthHair*.2,0))*mix(1.0,.3,pressure)+(styling+(inertia+flutter)*mix(1.0,.15,coat))*trim+outward*lengthHair*pressure*.92;
  vec3 p=root+n*(.008+lengthHair*t*(1.0-laid)*(1.0-pressure*.94))+bend*t*t;
  vec3 side=normalize(cross(n+styling*6.0+outward*pressure,viewDir)+vec3(.0001));
  p+=side*position.x*mix(.007+seed*.003,.013+seed*.007,coat)*(1.0-t*.94);
  if(p.z>1.0&&eyeDistance(p)<.005) p.z=min(p.z,1.145);
  vec3 hatPoint=(rigToHat*vec4(p,1.0)).xyz;
  vec3 ceiling=hatSurface(hatPoint);
  if(ceiling.y>.5&&hatPoint.y>ceiling.x-.022) {
    hatPoint.y=ceiling.x-.022;
    p=(hatToRig*vec4(hatPoint,1.0)).xyz;
  }
  // Keep the lowest pile above the current foot plane even during a deep squash
  // or a rolling landing. This plane moves with Gizmo on raised paths and rides.
  float floorDistance=dot(localFloor.xyz,p)+localFloor.w;
  if(floorDistance<.006) p+=localFloor.xyz*((.006-floorDistance)/dot(localFloor.xyz,localFloor.xyz));
  vec3 worldP=(modelMatrix*vec4(p,1.0)).xyz;
  vec3 N=normalize(mat3(modelMatrix)*n);
  vec3 V=normalize(cameraPosition-worldP);
  float light=max(dot(N,normalize(vec3(-.45,.8,.55))),0.0);
  float edge=pow(max(0.0,1.0-abs(dot(N,V))),2.7);
  vec3 pink=mix(vec3(.20,.001,.045),vec3(.77,.025,.24),.38+light*.62);
  vColor=pink*(.71+seed*.33)*(.70+t*.36)*mix(1.0,.79,coat);
  float tips=smoothstep(.15,.95,t)*(1.0-pressure*.85)*mix(1.0,.2,coat);
  float blueEdge=edge*tips*max(dot(N,normalize(vec3(-.7,.35,-.6))),.12);
  float violetEdge=edge*tips*max(dot(N,normalize(vec3(.7,.2,-.65))),.1);
  vColor+=vec3(.025,.25,.95)*blueEdge*.72+vec3(.40,.015,.70)*violetEdge*.55;
  vColor+=vec3(.40,.43,.70)*tips*pow(max(dot(N,normalize(vec3(.25,.9,-.4))),0.0),4.0)*.24;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`;

const furFragment = `
varying vec3 vColor;
void main() {
  gl_FragColor=vec4(vColor,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
