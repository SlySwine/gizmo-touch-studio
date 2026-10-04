import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { createChargeView } from './charge-view.js';
import { createLumaGuide } from './luma-guide.js';
import { createWorldRewards } from './world-rewards.js';

const UP = new THREE.Vector3(0, 1, 0);
const COLORS = { cyan: 0x73f7f0, pink: 0xff83cd, blue: 0x77bcff, gold: 0xffd48a, violet: 0xbb9aff };
const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const clamp = THREE.MathUtils.clamp;

/** Blender architecture, readable puzzle props, and the world's changing atmosphere. */
export async function createNeonScene({ scene, renderer, layout, coarse = false, camera = null }) {
  const root = new THREE.Group();
  root.name = 'Neon Wilds';
  scene.add(root);
  const previous = { background: scene.background, fog: scene.fog, environment: scene.environment };
  scene.background = new THREE.Color(0x10172d);
  scene.fog = new THREE.FogExp2(0x192238, 0.011);
  const owned = new Set();
  const keep = value => (owned.add(value), value);
  const physical = options => keep(new THREE.MeshStandardMaterial(options));
  const glow = (color, opacity = 1) => keep(new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false, depthWrite: opacity === 1 }));
  const geo = value => keep(value);
  const sphere = geo(new THREE.SphereGeometry(1, coarse ? 12 : 20, coarse ? 8 : 12));
  const octa = geo(new THREE.OctahedronGeometry(1));
  const cylinder = geo(new THREE.CylinderGeometry(1, 1, 1, 16));
  const beamGeo = geo(new THREE.CylinderGeometry(1, 1, 1, 8));
  const dark = physical({ color: 0x192542, metalness: 0.7, roughness: 0.36 });
  const metal = physical({ color: 0x677990, metalness: 0.82, roughness: 0.24 });
  const cyan = glow(COLORS.cyan), pink = glow(COLORS.pink), blue = glow(COLORS.blue), gold = glow(COLORS.gold), violet = glow(COLORS.violet);
  const emit = { cyan, pink, blue, gold, violet };
  function mesh(geometry, material, parent = root) {
    const value = new THREE.Mesh(geometry, material);
    parent.add(value);
    return value;
  }
  function ball(parent, x, y, z, radius, material) {
    const value = mesh(sphere, material, parent);
    value.position.set(x, y, z); value.scale.setScalar(radius);
    return value;
  }
  function ring(parent, radius, tube, material, x = 0, y = 0, z = 0) {
    const value = mesh(geo(new THREE.TorusGeometry(radius, tube, 6, 40)), material, parent);
    value.position.set(x, y, z);
    return value;
  }
  function floorRing(parent, radius, material, y = 0.065) {
    const value = ring(parent, radius, 0.035, material, 0, y);
    value.rotation.x = -Math.PI / 2;
    return value;
  }
  const object = id => layout.objects.find(item => item.id === id);
  function positioned(id) {
    const group = new THREE.Group(), data = object(id);
    group.name = id;
    group.position.set(data.x, data.y || 0, data.z);
    root.add(group);
    return group;
  }
  function link(parent, start, end, radius, material) {
    const value = mesh(beamGeo, material, parent);
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), d = b.clone().sub(a);
    value.position.copy(a.add(b).multiplyScalar(0.5));
    value.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    value.scale.set(radius, d.length(), radius);
    return value;
  }

  const ambient = new THREE.HemisphereLight(0xaabede, 0x261d39, 0.68);
  const key = new THREE.DirectionalLight(0xf5dfd4, 1.12);
  key.position.set(-24, 44, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -49;
  key.shadow.camera.right = key.shadow.camera.top = 49;
  key.shadow.camera.near = 1; key.shadow.camera.far = 120;
  key.shadow.normalBias = 0.05; key.shadow.bias = -0.00015;
  const rim = new THREE.DirectionalLight(0x829fd5, 0.62);
  rim.position.set(8, 17, -32);
  const hubLight = new THREE.PointLight(0x63cce5, 10, 27, 2);
  hubLight.position.set(0, 5, 1);
  const engineLight = new THREE.PointLight(0xffbd6b, 13, 18, 2);
  engineLight.position.set(25, 4, 17);
  const conservatoryLight = new THREE.PointLight(0xc47fae, 13, 24, 2); conservatoryLight.position.set(-27, 5, -5);
  root.add(ambient, key, key.target, rim, hubLight, engineLight, conservatoryLight);
  if (renderer) { renderer.shadowMap.enabled = !coarse; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }

  const skyMaterial = keep(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { time: { value: 0 }, wonder: { value: 0 } },
    vertexShader: `varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z=gl_Position.w*.99999;}`,
    fragmentShader: `
      varying vec3 vDirection; uniform float time; uniform float wonder;
      void main(){
        vec3 d=normalize(vDirection); float h=max(d.y,0.);
        vec3 color=mix(vec3(.035,.023,.075),vec3(.004,.007,.025),smoothstep(0.,.75,h));
        float dusk=exp(-pow((d.y-.025)*5.5,2.)); color+=vec3(.046,.008,.021)*dusk;
        vec3 sun=normalize(vec3(-.14,.26,-1.)); float a=length(d-sun);
        float halo=exp(-a*9.); color+=vec3(.24,.10,.23)*halo;
        float disc=smoothstep(.186,.180,a)-smoothstep(.165,.159,a);
        color+=vec3(.90,.45,.48)*disc*.85;
        float aurora=sin(d.x*8.+d.z*4.+sin(time*.08)*.18);
        float band=exp(-pow((d.y-.30-aurora*.09)*17.,2.));
        color+=vec3(.018,.11,.16)*band*(1.+wonder*2.)*(.35+.65*max(0.,-d.z));
        gl_FragColor=vec4(color,1.);
      }`
  }));
  const sky = mesh(geo(new THREE.SphereGeometry(190, 32, 20)), skyMaterial);
  sky.renderOrder = -10;
  const starPositions = [];
  let seed = 7331;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < (coarse ? 120 : 240); i++) {
    const phi = random() * Math.PI * 2, y = 0.12 + random() * 0.84, r = Math.sqrt(1 - y * y);
    starPositions.push(Math.cos(phi) * r * 175, y * 175, Math.sin(phi) * r * 175);
  }
  const starGeo = geo(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: 0xb1c8ef, size: 0.17, transparent: true, opacity: 0.75, sizeAttenuation: true, depthWrite: false, fog: false })));
  root.add(stars);

  // Broad reflected light makes the authored metallic surfaces readable without extra lamps.
  let environmentTarget = null;
  if (renderer) {
    const envScene = new THREE.Scene();
    const roomGeo = new THREE.BoxGeometry(80, 60, 80);
    const roomMat = new THREE.MeshBasicMaterial({ color: 0x3b4862, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(roomGeo, roomMat));
    const panelGeo = new THREE.PlaneGeometry(20, 18), panelMats = [];
    for (const [position, color, scale] of [ [[-15, 22, 12], 0xdce9ff, 1.7], [[16, 8, -22], 0x9ac8ff, 1.1], [[-28, 8, -5], 0x966084, 0.9] ]) {
      const mat = new THREE.MeshBasicMaterial({ color }); panelMats.push(mat);
      const panel = new THREE.Mesh(panelGeo, mat); panel.position.set(...position); panel.lookAt(0, 0, 0); panel.scale.setScalar(scale); envScene.add(panel);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    environmentTarget = pmrem.fromScene(envScene, 0.05, 0.1, 100);
    scene.environment = environmentTarget.texture;
    pmrem.dispose(); roomGeo.dispose(); roomMat.dispose(); panelGeo.dispose(); panelMats.forEach(m => m.dispose());
  }

  const gltf = await new GLTFLoader().loadAsync(new URL('../assets/neon-world.glb', import.meta.url).href);
  const paverPixels = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const index = (y * 128 + x) * 4;
    const grain = 211 + random() * 32 + Math.sin(x * 0.24 + Math.sin(y * 0.11)) * 4;
    paverPixels[index] = paverPixels[index + 1] = paverPixels[index + 2] = grain;
    paverPixels[index + 3] = 255;
  }
  const paverGrain = keep(new THREE.DataTexture(paverPixels, 128, 128, THREE.RGBAFormat));
  paverGrain.wrapS = paverGrain.wrapT = THREE.RepeatWrapping;
  paverGrain.repeat.set(2, 2); paverGrain.minFilter = THREE.LinearMipmapLinearFilter;
  paverGrain.magFilter = THREE.LinearFilter; paverGrain.generateMipmaps = true; paverGrain.needsUpdate = true;
  const architecture = gltf.scene;
  architecture.name = 'Blender world';
  root.add(architecture);
  const occluders = [];
  architecture.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = !/floor|path|line|ground|water/i.test(node.name);
    node.receiveShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if ('envMapIntensity' in material) material.envMapIntensity = 0.24;
      if (/paver|route alloy/i.test(material.name)) { material.roughness = Math.max(material.roughness, 0.57); material.metalness = Math.min(material.metalness, 0.32); if (node.geometry.attributes.uv) { material.bumpMap = paverGrain; material.bumpScale = 0.025; } }
      if (material.emissiveIntensity > 1) material.emissiveIntensity *= 0.65;
      if (/still cyan water/i.test(material.name)) { node.castShadow = false; material.roughness = 0.24; material.envMapIntensity = 0.3; }
      if (material.transparent && material.opacity < 0.75) node.castShadow = false;
    }
    // Camera collision is intentionally limited to substantial, opaque architecture.
    if (/collid|wall|pillar|tower|planter|machine|screen|spire.*side|divider/i.test(node.name) && !materials.every(m => m.transparent && m.opacity < 0.7)) occluders.push(node);
  });

  // Blender batches by material, so named physics boxes are the dependable camera shell.
  const cameraProxyMaterial = keep(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  const conditionalProxies = [];
  const b = layout.bounds;
  const boundaryProxies = [
    { id:'boundary-west', x:b.minX-1.1, z:(b.minZ+b.maxZ)/2, width:1.2, depth:b.maxZ-b.minZ+2, height:3.1 },
    { id:'boundary-east', x:b.maxX+1.1, z:(b.minZ+b.maxZ)/2, width:1.2, depth:b.maxZ-b.minZ+2, height:3.1 },
    { id:'boundary-north', x:(b.minX+b.maxX)/2, z:b.minZ-1.1, width:b.maxX-b.minX+1, depth:1.2, height:3.1 },
    { id:'boundary-south', x:(b.minX+b.maxX)/2, z:b.maxZ+1.1, width:b.maxX-b.minX+1, depth:1.2, height:3.1 }
  ];
  for (const collider of [...(layout.colliders || []), ...(layout.surfaces || []).filter(surface => surface.type === 'box'), ...boundaryProxies]) {
    const planted = /^(garden-threshold-|arrival-bed-)/.test(collider.id), conservatory = collider.id === 'conservatory-planter';
    const canopy = planted ? 1.5 : conservatory ? 1.8 : 0;
    // Dense authored plants are opaque to the camera even above their low physical bed.
    const proxyHeight = collider.height + canopy;
    const proxy = mesh(geo(new THREE.BoxGeometry(collider.width + (canopy ? .6 : 0), proxyHeight, collider.depth + (canopy ? .6 : 0))), cameraProxyMaterial);
    proxy.position.set(collider.x, (collider.y || 0) + proxyHeight / 2, collider.z);
    proxy.name = `camera-${collider.id}`; proxy.visible = false;
    proxy.updateMatrixWorld(); occluders.push(proxy);
    if (collider.requires) { conditionalProxies.push({proxy, requires:collider.requires}); proxy.layers.set(1); }
  }

  const interactableRings = new Map();
  for (const item of layout.objects) {
    if (['secret', 'gate', 'source', 'receiver', 'guide', 'chime'].includes(item.kind)) continue;
    const group = new THREE.Group(); group.position.set(item.x, (item.y || 0) + 0.04, item.z); root.add(group);
    const r = floorRing(group, item.kind === 'nursery' ? 2.2 : item.kind === 'console' ? 1.5 : 1.05, glow(COLORS.cyan, 0.14));
    r.material.depthWrite = false;
    interactableRings.set(item.id, { group, ring: r, base: item.kind === 'nursery' ? 2.2 : 1.05 });
  }

  // Three circuits make the relationship between the districts and the closed spire visible.
  const conduits = [];
  const conduitDefs = [
    { id: 'jellies', color: COLORS.pink, points: [[-26, -1], [-19, 2], [-9, -5], [-3.5, -13], [-2.1, -24]] },
    { id: 'prisms', color: COLORS.blue, points: [[28, -24], [24, -29], [13, -29], [7, -22], [2.1, -24]] },
    { id: 'engine', color: COLORS.gold, points: [[25, 17], [18, 20], [8, 13], [3, -4], [0, -24]] }
  ];
  for (const def of conduitDefs) {
    const curve = new THREE.CatmullRomCurve3(def.points.map(([x, z]) => new THREE.Vector3(x, 0.09, z)));
    const mat = glow(def.color, 0.15);
    const tube = mesh(geo(new THREE.TubeGeometry(curve, 70, 0.065, 5, false)), mat);
    const pulse = ball(root, 0, 0, 0, 0.14, glow(def.color));
    pulse.visible = false;
    conduits.push({ ...def, curve, mat, tube, pulse, power: 0 });
  }

  function makeJelly(color, size = 1) {
    const group = new THREE.Group();
    group.scale.setScalar(size);
    const bellMat = keep(new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.2, metalness: 0.1, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.15, transparent: true, opacity: 0.77, side: THREE.DoubleSide, depthWrite: false, iridescence: coarse ? 0 : 0.45 }));
    const bell = mesh(geo(new THREE.SphereGeometry(0.68, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.57)), bellMat, group);
    bell.scale.y = 0.77;
    const lower = ring(group, 0.665, 0.028, glow(color), 0, -0.12); lower.rotation.x = -Math.PI / 2;
    const core = ball(group, 0, 0.12, 0, 0.23, glow(color));
    const strands = [];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, r = 0.35 + (i % 2) * 0.12;
      const path = [];
      for (let j = 0; j <= 7; j++) {
        const t = j / 7, curl = t * t * 0.38;
        path.push(new THREE.Vector3(Math.cos(a) * r + Math.sin(t * 5 + a) * curl, -0.12 - t * (1.08 + (i % 3) * 0.15), Math.sin(a) * r + Math.cos(t * 5 + a) * curl));
      }
      strands.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 14, 0.023, 4, false));
    }
    const tentacleGeo = geo(mergeGeometries(strands)); strands.forEach(g => g.dispose());
    const tentacles = mesh(tentacleGeo, glow(color, 0.75), group);
    return { group, bell, core, tentacles, bellMat, lower };
  }
  const nursery = positioned('nursery');
  const bowlMat = physical({ color: 0x304668, metalness: 0.7, roughness: 0.27 });
  const bowl = mesh(geo(new THREE.SphereGeometry(1.8, 36, 16, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.46)), bowlMat, nursery);
  bowl.position.y = 0.025; bowl.scale.y = 0.035;
  const bowlEdge = floorRing(nursery, 1.8, pink, 0.055);
  const nurseryPool = mesh(geo(new THREE.CircleGeometry(1.72, 40)), glow(COLORS.pink, 0.22), nursery);
  nurseryPool.rotation.x = -Math.PI / 2; nurseryPool.position.y = 0.045;
  const nurseryHalos = [floorRing(nursery, 1.28, glow(COLORS.pink, 0.25), 0.048), floorRing(nursery, 0.68, glow(COLORS.pink, 0.38), 0.05)];
  const jellyById = new Map();
  for (const [i, id] of ['jelly-a', 'jelly-b', 'jelly-c'].entries()) {
    const jelly = makeJelly([COLORS.pink, COLORS.violet, COLORS.cyan][i], 0.88);
    root.add(jelly.group); jelly.phase = i * 2.1; jellyById.set(id, jelly);
  }
  const roamingJellies = [];
  for (let i = 0; i < (coarse ? 4 : 7); i++) {
    const jelly = makeJelly([COLORS.pink, COLORS.cyan, COLORS.violet][i % 3], 1.5 + (i % 3) * 0.4);
    root.add(jelly.group);
    jelly.origin = new THREE.Vector3(-33 + (i % 3) * 13, 9 + (i % 2) * 4, -18 + Math.floor(i / 3) * 13);
    jelly.phase = i * 1.75;
    roamingJellies.push(jelly);
  }

  const mirrors = new Map();
  for (const id of ['mirror-a', 'mirror-b']) {
    const base = positioned(id);
    const foot = mesh(cylinder, dark, base); foot.position.y = 0.36; foot.scale.set(0.95, 0.72, 0.95); foot.castShadow = true;
    floorRing(base, 0.88, blue, 0.75);
    const turn = new THREE.Group(); turn.position.y = 1.38; base.add(turn);
    const prism = mesh(octa, keep(new THREE.MeshPhysicalMaterial({ color: 0xc0e9ff, metalness: 0.6, roughness: 0.1, clearcoat: 1, emissive: 0x314968, emissiveIntensity: 0.5 })), turn);
    prism.scale.set(0.62, 0.79, 0.32); prism.rotation.y = Math.PI / 4; prism.castShadow = true;
    // A broad luminous arrow points in the exact direction the beam leaves the prism.
    link(turn, [0, -0.25, -0.35], [0, -0.25, -1.05], 0.06, blue);
    const arrow = mesh(geo(new THREE.ConeGeometry(0.19, 0.32, 3)), blue, turn);
    arrow.position.set(0, -0.25, -1.16); arrow.rotation.x = -Math.PI / 2;
    const dial = floorRing(base, 1.2, glow(COLORS.blue, 0.3), 0.055);
    for (let k = 0; k < 4; k++) {
      const [dx, dz] = dirs[k]; ball(base, dx * 1.2, 0.10, dz * 1.2, 0.08, k === 0 ? cyan : blue);
    }
    mirrors.set(id, { base, turn, prism, dial });
  }
  const source = positioned('prism-source');
  const sourcePylon = mesh(cylinder, metal, source); sourcePylon.position.y = 0.64; sourcePylon.scale.set(0.48, 1.28, 0.48);
  const sourceOrb = ball(source, 0, 1.38, 0, 0.3, blue);
  const beamMat = glow(0x9fdfff), beamOuter = glow(0x61bfff, 0.13);
  const beamGroup = new THREE.Group(); root.add(beamGroup);
  function beamPair() {
    return { core: mesh(beamGeo, beamMat, beamGroup), halo: mesh(beamGeo, beamOuter, beamGroup) };
  }
  const beams = [beamPair(), beamPair(), beamPair()];
  function setBeam(pair, from, to, enabled = true) {
    pair.core.visible = pair.halo.visible = enabled;
    if (!enabled) return;
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), v = b.clone().sub(a);
    for (const [item, width] of [[pair.core, 0.035], [pair.halo, 0.12]]) {
      item.position.copy(a).add(b).multiplyScalar(0.5); item.quaternion.setFromUnitVectors(UP, v.clone().normalize()); item.scale.set(width, v.length(), width);
    }
  }
  const receiver = positioned('prism-receiver');
  const receiverStand = mesh(cylinder, dark, receiver); receiverStand.scale.set(0.8, 0.7, 0.8); receiverStand.position.y = 0.35;
  const receiverHalo = ring(receiver, 0.92, 0.10, blue, 0, 1.4); receiverHalo.rotation.y = Math.PI / 2;
  const receiverCore = ball(receiver, 0, 1.38, 0, 0.39, glow(COLORS.blue, 0.5));
  const receiverRays = [];
  for (let i = 0; i < 5; i++) {
    const value = ring(receiver, 1.1 + i * 0.3, 0.018, glow(COLORS.blue, 0.14), 0, 1.4); value.rotation.y = Math.PI / 2; receiverRays.push(value);
  }

  const batteries = new Map(), sockets = new Map();
  for (const [i, id] of ['battery-a', 'battery-b'].entries()) {
    const color = i === 0 ? COLORS.cyan : COLORS.gold;
    const group = positioned(id);
    const body = mesh(cylinder, dark, group); body.scale.set(0.21, 0.92, 0.21); body.castShadow = true;
    const luminous = mesh(cylinder, glow(color), group); luminous.scale.set(0.25, 0.73, 0.25);
    const frame = ring(group, 0.37, 0.055, metal, 0, 0.46); frame.rotation.x = -Math.PI / 2;
    const bottom = ring(group, 0.37, 0.055, metal, 0, -0.46); bottom.rotation.x = -Math.PI / 2;
    const stripe = mesh(geo(new THREE.BoxGeometry(0.11, 0.79, 0.76)), dark, group);
    const symbol = i === 0 ? geo(new THREE.TorusGeometry(0.16, 0.033, 5, 20)) : geo(new THREE.TorusGeometry(0.19, 0.033, 5, 3));
    const badge = mesh(symbol, glow(color), group); badge.position.set(0, 0, 0.405);
    batteries.set(id, { group, luminous, index: i });
    const socket = positioned(i === 0 ? 'socket-a' : 'socket-b');
    const foot = mesh(cylinder, dark, socket); foot.scale.set(0.82, 0.42, 0.82); foot.position.y = 0.21;
    const halo = floorRing(socket, 0.68, glow(color), 0.46);
    const inset = mesh(cylinder, physical({ color: 0x04091a, metalness: 0.6, roughness: 0.2 }), socket); inset.scale.set(0.39, 0.16, 0.39); inset.position.y = 0.43;
    const socketBadge = mesh(symbol, glow(color), socket); socketBadge.position.set(0, 0.29, 0.84); socketBadge.scale.setScalar(1.4);
    sockets.set(i === 0 ? 'socket-a' : 'socket-b', { group: socket, halo, color, index: i });
  }
  const consoleGroup = positioned('foundry-console');
  const consoleBase = mesh(cylinder, dark, consoleGroup); consoleBase.scale.set(1.08, 0.75, 1.08); consoleBase.position.y = 0.37;
  const consoleFace = mesh(geo(new THREE.CircleGeometry(0.98, 40)), physical({ color: 0x152538, metalness: 0.5, roughness: 0.22 }), consoleGroup); consoleFace.rotation.x = -Math.PI / 2; consoleFace.position.y = 0.765;
  const pulseRing = floorRing(consoleGroup, 0.91, gold, 0.79);
  const pulseSweep = floorRing(consoleGroup, 0.42, glow(COLORS.gold, 0.6), 0.81);
  const consoleButton = ball(consoleGroup, 0, 0.85, 0, 0.24, gold); consoleButton.scale.y = 0.13;
  const beatLamps = [-0.48, 0, 0.48].map(x => ball(consoleGroup, x, 0.88, -0.6, 0.105, glow(COLORS.gold, 0.15)));
  const wheel = new THREE.Group(); wheel.position.set(25, 3.5, 11.1); root.add(wheel);
  ring(wheel, 1.46, 0.13, metal);
  ring(wheel, 1.25, 0.025, gold);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    link(wheel, [Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0], [Math.cos(a) * 1.4, Math.sin(a) * 1.4, 0], 0.08, dark);
  }
  ball(wheel, 0, 0, 0, 0.32, gold);
  const engineRings = [ring(root, 1.2, 0.07, glow(COLORS.gold, 0.4), 25, 3.5, 11.0), ring(root, 0.72, 0.04, glow(COLORS.gold, 0.3), 25, 3.5, 10.9)];

  const gate = positioned('aurora-gate');
  const gateMaterial = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, opacity: { value: 0.45 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv; uniform float time; uniform float opacity; void main(){float edge=pow(abs(vUv.x-.5)*2.,7.)+pow(abs(vUv.y-.5)*2.,7.);float scan=pow(.5+.5*sin(vUv.y*70.-time*1.7),20.);float weave=pow(.5+.5*sin((vUv.x+vUv.y)*55.),25.)*.14;gl_FragColor=vec4(.39,.56,1.,opacity*(.14+edge*.7+scan*.22+weave));}`
  }));
  const barrier = mesh(geo(new THREE.PlaneGeometry(8.8, 5.4)), gateMaterial, gate); barrier.position.y = 2.7;
  const sanctuarySeals = [];
  for (const seal of layout.barriers || []) {
    const height = Math.max(0.1, seal.height - (seal.y || 0));
    const side = seal.depth > seal.width, width = side ? seal.depth : seal.width;
    const pane = mesh(geo(new THREE.PlaneGeometry(width, height)), gateMaterial);
    pane.position.set(seal.x, (seal.y || 0) + height / 2, seal.z); if (side) pane.rotation.y = Math.PI / 2;
    const frameMaterial = glow(COLORS.violet, 0.18);
    const frame = mesh(geo(new THREE.BoxGeometry(seal.width, .035, seal.depth)), frameMaterial); frame.position.set(seal.x, seal.height, seal.z);
    const proxy = mesh(geo(new THREE.BoxGeometry(seal.width, height, seal.depth)), cameraProxyMaterial);
    proxy.position.copy(pane.position); proxy.visible = false; proxy.updateMatrixWorld(); occluders.push(proxy);
    sanctuarySeals.push({pane,frame,proxy});
  }
  const gateSeals = [];
  for (const [i, def] of conduitDefs.entries()) {
    const seal = new THREE.Group(); seal.position.set(def.points[def.points.length - 1][0], 4.5, 0.3); gate.add(seal);
    const material = glow(def.color, 0.22);
    const outer = ring(seal, 0.62, 0.065, material);
    if (def.id === 'jellies') {
      const cap = mesh(geo(new THREE.SphereGeometry(0.33, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), material, seal); cap.scale.z = 0.2;
      for (let j = -1; j <= 1; j++) link(seal, [j * 0.19, 0, 0], [j * 0.22, -0.33, 0], 0.028, material);
    } else if (def.id === 'prisms') {
      const gem = mesh(octa, material, seal); gem.scale.set(0.31, 0.42, 0.08);
    } else {
      ring(seal, 0.30, 0.05, material);
      link(seal, [-0.24, 0, 0], [0.24, 0, 0], 0.025, material);
      link(seal, [0, -0.24, 0], [0, 0.24, 0], 0.025, material);
    }
    gateSeals.push({ ...def, group: seal, material, outer });
  }
  let gateAmount = 0;
  const heartGroup = positioned('aurora-heart');
  const heart = mesh(octa, keep(new THREE.MeshPhysicalMaterial({ color: 0xcac1ff, emissive: 0x7669cb, emissiveIntensity: 1.0, metalness: 0.25, roughness: 0.12, clearcoat: 1 })), heartGroup);
  heart.scale.set(0.78, 1.15, 0.78); heart.position.y = 1.75;
  const heartHalo = ring(heartGroup, 1.35, 0.035, violet, 0, 1.75); heartHalo.rotation.y = Math.PI / 4;
  const heartFloor = floorRing(heartGroup, 1.7, glow(COLORS.violet, 0.24), 0.08);

  const secrets = new Map();
  for (const item of layout.objects.filter(o => o.kind === 'secret')) {
    const group = positioned(item.id);
    const gem = mesh(octa, keep(new THREE.MeshPhysicalMaterial({ color: 0xffe7b3, emissive: 0x896b2d, emissiveIntensity: 0.7, metalness: 0.45, roughness: 0.19, clearcoat: 1 })), group);
    gem.scale.set(0.20, 0.37, 0.20); gem.position.y = 0.83;
    const halo = floorRing(group, 0.46, glow(COLORS.gold, 0.25), 0.06);
    secrets.set(item.id, { group, gem, halo });
  }
  const chargeView = createChargeView(root, coarse);
  const guide = createLumaGuide(root, layout, camera);
  const rewards = createWorldRewards(root, layout, coarse);

  // One soft contact decal anchors Gizmo even when the mobile shadow map is disabled.
  const contactPixels = new Uint8Array(96 * 96 * 4);
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const index = (y * 96 + x) * 4;
    const radius = Math.hypot((x + 0.5) / 48 - 1, (y + 0.5) / 48 - 1);
    const edge = 1 - THREE.MathUtils.smoothstep(radius, 0.72, 1);
    contactPixels[index] = contactPixels[index + 1] = contactPixels[index + 2] = 0;
    contactPixels[index + 3] = Math.round(255 * Math.exp(-radius * radius * 3.5) * edge);
  }
  const contactTexture = keep(new THREE.DataTexture(contactPixels, 96, 96, THREE.RGBAFormat));
  contactTexture.minFilter = contactTexture.magFilter = THREE.LinearFilter;
  contactTexture.needsUpdate = true;
  const contactMaterial = keep(new THREE.MeshBasicMaterial({ map: contactTexture, color: 0x000000, transparent: true, opacity: 0.64, depthTest: true, depthWrite: false, toneMapped: false }));
  const contactShadow = mesh(geo(new THREE.PlaneGeometry(1, 1)), contactMaterial);
  contactShadow.name = 'Gizmo ground contact';
  contactShadow.renderOrder = -1;
  const contactNormal = new THREE.Vector3(), planeNormal = new THREE.Vector3(0, 0, 1);
  function contactFloor(x, z, state) {
    let height = 0;
    contactNormal.set(0, 1, 0);
    for (const surface of layout.surfaces || []) {
      if (surface.requires && !state.missions?.[surface.requires]) continue;
      if (Math.abs(x - surface.x) > surface.width / 2 + 0.001 || Math.abs(z - surface.z) > surface.depth / 2 + 0.001) continue;
      let y = surface.height || 0, slopeX = 0, slopeZ = 0;
      if (surface.type === 'ramp') {
        const axis = surface.axis || '-z', alongX = axis.includes('x'), direction = axis.startsWith('-') ? -1 : 1;
        const span = alongX ? surface.width : surface.depth;
        const delta = alongX ? x - surface.x : z - surface.z;
        const amount = clamp(0.5 + delta / span * direction, 0, 1);
        y = surface.low + (surface.high - surface.low) * amount;
        const slope = direction * (surface.high - surface.low) / span;
        if (alongX) slopeX = slope; else slopeZ = slope;
      }
      if (y >= height) { height = y; contactNormal.set(-slopeX, 1, -slopeZ).normalize(); }
    }
    return height;
  }

  const moteCount = coarse ? 75 : 160, moteData = new Float32Array(moteCount * 3), moteBase = [];
  for (let i = 0; i < moteCount; i++) { moteBase.push({ x: (random() - 0.5) * 82, y: 0.5 + random() * 10, z: (random() - 0.5) * 78, phase: random() * Math.PI * 2 }); }
  const moteGeo = geo(new THREE.BufferGeometry()); moteGeo.setAttribute('position', new THREE.BufferAttribute(moteData, 3));
  const motes = new THREE.Points(moteGeo, keep(new THREE.PointsMaterial({ color: 0x96dedc, size: 0.065, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
  root.add(motes);
  const burstGeo = geo(new THREE.BufferGeometry());
  const burstData = new Float32Array(90 * 3); burstGeo.setAttribute('position', new THREE.BufferAttribute(burstData, 3));
  const celebration = new THREE.Points(burstGeo, keep(new THREE.PointsMaterial({ color: 0xc6b5ff, size: 0.17, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending })));
  root.add(celebration);
  let completedAt = null;
  const echoWisps = Array.from({ length: 6 }, (_, i) => {
    const wisp = ball(root, 0, 0, 0, 0.075, glow([COLORS.gold, COLORS.cyan, COLORS.pink, COLORS.violet, COLORS.blue, COLORS.gold][i]));
    wisp.visible = false; return wisp;
  });
  const echoTrailData = new Float32Array(6 * 8 * 3), echoTrailGeo = geo(new THREE.BufferGeometry());
  echoTrailGeo.setAttribute('position', new THREE.BufferAttribute(echoTrailData, 3));
  const echoTrail = new THREE.Points(echoTrailGeo, keep(new THREE.PointsMaterial({ color: 0xbacde6, size: 0.04, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })));
  root.add(echoTrail);
  const echoCrown = ring(root, 6, 0.08, glow(COLORS.pink, 0.55), 0, 10, -37);
  echoCrown.rotation.x = Math.PI / 2; echoCrown.visible = false;

  function update(time, dt, state) {
    if (!state) return;
    const t = state.elapsed ?? time;
    const missions = state.missions || {};
    const activeId = state.nearby?.id;
    skyMaterial.uniforms.time.value = t;
    skyMaterial.uniforms.wonder.value = (state.secrets?.length || 0) / 6;
    gateMaterial.uniforms.time.value = t;
    for (const [id, value] of interactableRings) {
      const selected = activeId === id;
      value.ring.material.opacity = selected ? 0.82 : 0.08;
      value.ring.material.color.setHex(selected ? COLORS.gold : COLORS.cyan);
      value.ring.scale.setScalar(selected ? 1 + Math.sin(t * 4) * 0.035 : 1);
      const jelly = state.jellies?.[id], battery = state.batteries?.[id];
      if (jelly) { value.group.position.set(jelly.x, 0.05, jelly.z); value.group.visible = jelly.status === 'waiting'; }
      if (battery) value.group.visible = battery.status === 'waiting';
    }
    for (const conduit of conduits) {
      conduit.power = THREE.MathUtils.damp(conduit.power, missions[conduit.id] ? 1 : 0, 1.8, dt);
      conduit.mat.opacity = 0.10 + conduit.power * 0.66;
      conduit.pulse.visible = conduit.power > 0.05;
      if (conduit.pulse.visible) conduit.pulse.position.copy(conduit.curve.getPoint((t * 0.1) % 1));
    }
    for (const [id, jelly] of jellyById) {
      const data = state.jellies?.[id] || object(id);
      const delivered = data.status === 'delivered';
      const bob = Math.sin(t * 2.2 + jelly.phase) * 0.06;
      jelly.group.position.set(data.x, (data.y ?? 1.1) + 0.42 + bob, data.z);
      jelly.group.rotation.y = Math.sin(t * 0.8 + jelly.phase) * 0.25;
      jelly.bell.scale.y = 0.73 + Math.sin(t * 2.2 + jelly.phase) * 0.055;
      jelly.tentacles.rotation.x = Math.sin(t * 1.6 + jelly.phase) * 0.13;
      jelly.tentacles.rotation.z = Math.cos(t * 1.3 + jelly.phase) * 0.10;
      jelly.core.scale.setScalar(delivered ? 0.26 : 0.23);
      jelly.bellMat.emissiveIntensity = delivered ? 0.4 : 0.2;
    }
    for (const jelly of roamingJellies) {
      const freedom = missions.jellies ? 1 : 0.25;
      jelly.group.position.copy(jelly.origin);
      jelly.group.position.x += Math.sin(t * 0.12 + jelly.phase) * 3.5 * freedom;
      jelly.group.position.y += Math.sin(t * 0.6 + jelly.phase) * 0.85;
      jelly.group.position.z += Math.cos(t * 0.10 + jelly.phase) * 2.5 * freedom;
      jelly.group.rotation.z = Math.sin(t * 0.4 + jelly.phase) * 0.09;
      jelly.bell.scale.y = 0.75 + Math.sin(t * 1.4 + jelly.phase) * 0.05;
      jelly.tentacles.rotation.y = Math.sin(t * 0.5 + jelly.phase) * 0.13;
      jelly.bellMat.emissiveIntensity = missions.jellies ? 0.42 : 0.14;
    }
    nurseryPool.material.opacity = missions.jellies ? 0.44 : 0.22;
    nurseryHalos.forEach((value, i) => value.scale.setScalar(1 + Math.sin(t * 1.1 + i) * 0.06));
    const mirrorA = state.mirrors?.['mirror-a'] || { rotation: 1 }, mirrorB = state.mirrors?.['mirror-b'] || { rotation: 2 };
    for (const [id, data] of [['mirror-a', mirrorA], ['mirror-b', mirrorB]]) {
      const prop = mirrors.get(id);
      prop.turn.rotation.y = -(data.rotation || 0) * Math.PI / 2;
      prop.prism.material.emissiveIntensity = data.lit || missions.prisms ? 1.1 : 0.25;
      prop.dial.material.opacity = data.solved || missions.prisms ? 0.7 : 0.24;
    }
    const a = object('mirror-a'), b = object('mirror-b'), src = object('prism-source'), target = object('prism-receiver');
    const aDir = dirs[(mirrorA.rotation || 0) % 4], bDir = dirs[(mirrorB.rotation || 0) % 4];
    const reachesB = mirrorA.rotation === 0 || missions.prisms, reachesReceiver = reachesB && (mirrorB.rotation === 1 || missions.prisms);
    setBeam(beams[0], [src.x, 1.38, src.z], [a.x, 1.38, a.z]);
    setBeam(beams[1], [a.x, 1.38, a.z], reachesB ? [b.x, 1.38, b.z] : [a.x + aDir[0] * 8, 1.38, a.z + aDir[1] * 8]);
    setBeam(beams[2], [b.x, 1.38, b.z], reachesReceiver ? [target.x, 1.38, target.z] : [b.x + bDir[0] * 8, 1.38, b.z + bDir[1] * 8], reachesB);
    receiverCore.material.opacity = reachesReceiver ? 1 : 0.2;
    receiverCore.scale.setScalar(reachesReceiver ? 0.43 + Math.sin(t * 2) * 0.03 : 0.3);
    receiverRays.forEach((value, i) => { value.material.opacity = reachesReceiver ? 0.32 - i * 0.035 : 0.07; value.rotation.x = reachesReceiver ? Math.sin(t * 0.5 + i) * 0.2 : 0; });
    for (const [id, battery] of batteries) {
      const data = state.batteries?.[id] || { ...object(id), status: 'waiting' };
      battery.group.visible = true;
      battery.group.position.set(data.x, (data.y ?? 0.75) + (data.status === 'waiting' ? Math.sin(t * 2 + battery.index) * 0.06 : 0), data.z);
      battery.group.rotation.y = data.status === 'waiting' ? t * 0.25 : state.player?.yaw || 0;
      battery.group.rotation.z = data.status === 'carried' ? 0.22 : 0;
    }
    for (const [id, socket] of sockets) {
      const installed = Object.values(state.batteries || {}).some(value => value.status === 'installed' && value.socketId === id);
      socket.halo.scale.setScalar(installed ? 1 : 1 + Math.sin(t * 2) * 0.04);
      socket.halo.material.color.setHex(installed ? 0xb5ffe4 : socket.color);
    }
    const engine = state.engine || {};
    const ready = !!engine.ready, engineDone = !!missions.engine;
    pulseRing.material.color.setHex(ready || engineDone ? 0x93ffe3 : COLORS.gold);
    pulseSweep.scale.setScalar(engineDone ? 1.8 : 0.25 + (engine.pulse || 0) * 1.7);
    pulseSweep.material.opacity = engine.started || engineDone ? 0.72 : 0.16;
    consoleButton.material.color.setHex(ready || engineDone ? 0x93ffe3 : COLORS.gold);
    consoleButton.position.y = 0.85 + (ready ? Math.sin(t * 5) * 0.03 : 0);
    beatLamps.forEach((lamp, i) => { lamp.material.opacity = i < (engine.beats || 0) ? 1 : 0.16; lamp.material.color.setHex(i < (engine.beats || 0) ? 0x93ffe3 : COLORS.gold); });
    wheel.rotation.z += dt * (engineDone ? 1.25 : engine.started ? 0.35 : 0.06);
    engineRings.forEach((value, i) => { value.rotation.y = Math.sin(t * (engineDone ? 1 : 0.25) + i) * (engineDone ? 0.8 : 0.2); value.material.opacity = engineDone ? 0.7 : 0.22; });
    engineLight.intensity = engineDone ? 24 : engine.started ? 18 : 10;
    conservatoryLight.intensity = missions.jellies ? 20 : 13;
    gateAmount = THREE.MathUtils.damp(gateAmount, state.gateOpen || missions.completed ? 1 : 0, 2.5, dt);
    gateMaterial.uniforms.opacity.value = (1 - gateAmount) * 0.6;
    barrier.visible = gateAmount < 0.99;
    sanctuarySeals.forEach(({pane,frame,proxy}) => { pane.visible = frame.visible = gateAmount < .99; frame.material.opacity = (1 - gateAmount) * .18; proxy.layers.set(state.gateOpen ? 1 : 0); });
    gateSeals.forEach(seal => { seal.material.opacity = missions[seal.id] ? 1 : 0.23; seal.outer.scale.setScalar(missions[seal.id] ? 1 + Math.sin(t * 1.5) * 0.025 : 1); });
    heart.rotation.y = t * 0.38;
    heart.position.y = 1.75 + Math.sin(t * 1.4) * 0.15;
    heart.material.emissiveIntensity = state.gateOpen ? 1.6 : 0.6;
    heartHalo.rotation.y = t * 0.25; heartHalo.rotation.x = Math.sin(t * 0.3) * 0.35;
    heartFloor.material.opacity = state.gateOpen ? 0.6 : 0.2;
    const found = state.secrets || [];
    for (const [id, secret] of secrets) {
      secret.group.visible = !found.includes(id);
      secret.gem.rotation.y = t * 0.7;
      secret.gem.position.y = 0.83 + Math.sin(t * 2 + secret.group.position.x) * 0.08;
    }
    const player = state.player || { x: 0, y: 0, z: 14, yaw: 0 };
    const groundHeight = state.transport ? player.y : contactFloor(player.x, player.z, state);
    if (state.transport) contactNormal.set(0, 1, 0);
    const airborneHeight = Math.max(0, player.y - groundHeight);
    contactShadow.position.set(player.x, groundHeight + 0.03, player.z);
    contactShadow.quaternion.setFromUnitVectors(planeNormal, contactNormal);
    const spread = 1 + Math.min(4, airborneHeight) * 0.22;
    contactShadow.scale.set(2.3 * spread, 2.05 * spread, 1);
    contactMaterial.opacity = 0.64 / (1 + airborneHeight * 0.9);
    const wispAt = (i, age) => {
      const phase = t * 1.7 + i * 2.399 - age, radius = 0.7 + (i % 3) * 0.27;
      return [player.x - Math.sin(player.yaw) * 1.7 + Math.cos(phase) * radius,
        player.y + 0.7 + (i % 2) * 0.3 + Math.sin(phase * 1.3) * 0.12,
        player.z - Math.cos(player.yaw) * 1.7 + Math.sin(phase) * radius];
    };
    echoWisps.forEach((wisp, i) => {
      wisp.visible = i < found.length; wisp.position.set(...wispAt(i, 0));
      for (let j = 0; j < 8; j++) {
        const position = i < found.length ? wispAt(i, j * 0.08) : [0, -100, 0];
        echoTrailData.set(position, (i * 8 + j) * 3);
      }
    });
    echoTrailGeo.attributes.position.needsUpdate = true;
    echoTrail.visible = found.length > 0;
    echoCrown.visible = found.length === 6;
    echoCrown.rotation.z = t * 0.08;
    echoCrown.scale.setScalar(1 + Math.sin(t * 0.8) * 0.06);
    chargeView.update(t, state); guide.update(t, dt, state); rewards.update(t, dt, state);
    conditionalProxies.forEach(({proxy,requires}) => proxy.layers.set(missions[requires] ? 0 : 1));
    for (let i = 0; i < moteCount; i++) {
      const base = moteBase[i]; moteData[i * 3] = base.x + Math.sin(t * 0.17 + base.phase) * 0.8;
      moteData[i * 3 + 1] = base.y + Math.sin(t * 0.3 + base.phase) * 0.35;
      moteData[i * 3 + 2] = base.z + Math.cos(t * 0.12 + base.phase) * 0.7;
    }
    moteGeo.attributes.position.needsUpdate = true;
    if (state.completed || missions.completed) {
      if (completedAt === null) completedAt = t;
      const age = t - completedAt;
      celebration.material.opacity = Math.min(0.7, age * 0.3);
      for (let i = 0; i < 90; i++) {
        const a = i * 2.399 + age * 0.13, radius = 2 + (i % 9) * 0.48;
        burstData[i * 3] = Math.cos(a) * radius;
        burstData[i * 3 + 1] = 5 + ((i * 0.19 + age * 0.45) % 8);
        burstData[i * 3 + 2] = -37 + Math.sin(a) * radius;
      }
      burstGeo.attributes.position.needsUpdate = true;
    } else { completedAt = null; celebration.material.opacity = 0; }
    root.userData.loadedBlenderWorld = true;
    root.userData.missionVisuals = { ...missions };
  }

  function dispose() {
    chargeView.dispose(); guide.dispose(); rewards.dispose();
    scene.remove(root);
    scene.background = previous.background; scene.fog = previous.fog; scene.environment = previous.environment;
    environmentTarget?.dispose();
    const resources = new Set(owned);
    architecture.traverse(node => {
      if (!node.isMesh) return;
      if (node.geometry) resources.add(node.geometry);
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
        resources.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      }
    });
    resources.forEach(value => value.dispose?.());
    key.shadow.map?.dispose();
  }
  return { update, occluders, dispose, group: root, get guidance() { return {...guide.group.userData}; }, demonstrate: id => guide.demonstrate(id), handleEvents(events) { guide.handleEvents(events); rewards.handleEvents(events); } };
}
